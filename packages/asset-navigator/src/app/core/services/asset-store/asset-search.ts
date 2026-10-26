import MiniSearch from 'minisearch';
import {
  fallbackIndexableProperties,
  indexableText,
  type AssetIndexablePropertyMap,
  type IndexableProperty,
} from './asset-definition.model';
import { assetTypeLabel } from './asset-store.model';
import type { AssetHierarchy, AssetNode } from './asset-store.model';

/**
 * The fast-navigation search: one in-memory inverted index over the cached fleet, plus the
 * ranking that turns its scores into the order a user expects.
 *
 * Why an index at all — the previous implementation scanned every node in the hierarchy on
 * every keystroke, up to four times (once per caller of `filterHierarchy`), and could only
 * match one literal substring of `node.name`. That rules out the two things people
 * actually type: more than one word ("emden t12") and something that is not the name (a
 * serial number, a type, a park further up the path).
 *
 * Why MiniSearch — zero dependencies, in-memory, and it brings prefix matching, bounded
 * typo tolerance, multi-field boosts and a relevance score for free. What it does **not**
 * bring is character offsets: `match` is a term → fields map, so the `<mark>` ranges are
 * still computed here against the name (see {@link highlightRanges}).
 *
 * Four passes, in order, so nothing that used to match stops matching:
 *
 * 1. **MiniSearch** — tokenized, prefix + fuzzy, all terms required (`AND`). The edit
 *    budget is per term ({@link defaultFuzziness}): short and all-digit terms get none,
 *    because "013" is an identity, and one edit away from it is a *different turbine*.
 * 2. **Literal substring over the name** — the old behaviour. A token index cannot match
 *    the middle of a token ("mden" in "Emden"), and that used to work.
 * 3. **Subsequence** — every character of the term, in order, anywhere in the name. Covers
 *    abbreviations a token index structurally cannot see ("wtg12" → "WTG 12").
 * 4. **MiniSearch again with a widened budget** — transpositions ("Emedn") cost two edits
 *    and need it; runs only when 1–3 found nothing, and flags the result as fuzzy.
 *
 * Design: `docs/FastNavigation/tree-component-design.md` §3.5.
 */

export type MatchMode = 'exact' | 'startsWith' | 'contains';

export interface MatchRange {
  start: number;
  end: number;
}

/**
 * Minimum term length for the fuzzy passes. One character is a subsequence of almost every
 * name, so it would "match" the whole fleet and read as a broken filter.
 */
export const MIN_FUZZY_LENGTH = 2;

/** What the index stores per asset. Text fields are indexed; the rest feeds the ranking. */
interface AssetSearchDoc {
  id: string;
  name: string;
  externalId: string;
  type: string;
  path: string;
  status: string;
  notes: string;
  /** Properties the asset definition marks required — identity-bearing, so boosted. */
  keyAttributes: string;
  attributes: string;
  // ── stored, not indexed: the ranking signals ───────────────────────────────
  depth: number;
  turbineCount: number;
  severity: number;
  unavailable: boolean;
}

/** The built index. Opaque to callers — they only ever hand it back to {@link searchAssets}. */
export type AssetSearchIndex = MiniSearch<AssetSearchDoc>;

const SEARCH_FIELDS = [
  'name',
  'externalId',
  'type',
  'path',
  'status',
  'notes',
  'keyAttributes',
  'attributes',
] as const;

/**
 * Field weights. The name dominates by design — everything else exists so that a query
 * which is *not* a name still lands somewhere, not so that it can outrank one that is.
 */
const FIELD_BOOST: Record<string, number> = {
  name: 8,
  externalId: 6,
  keyAttributes: 3,
  type: 3,
  path: 2,
  status: 1.5,
  notes: 1.5,
  attributes: 1,
};

const SEVERITY_RANK: Record<string, number> = { critical: 4, major: 3, minor: 2, warning: 1 };

/**
 * Status words, so "unavailable" or "critical" filters the fleet like any other term.
 * Both the asset's own alarms and its subtree's worst are in — searching "critical" from
 * the fleet root should reach the park that contains the critical turbine, not just the
 * turbine.
 */
function statusText(node: AssetNode, worst: string | null): string {
  const words = new Set<string>([node.availability]);

  for (const key of Object.keys(SEVERITY_RANK)) {
    if (node.alarms[key as keyof typeof node.alarms] > 0) words.add(key);
  }
  if (worst) words.add(worst);
  if (node.availability === 'unavailable') words.add('stopped');

  return [...words].join(' ');
}

function externalIdOf(properties: Readonly<Record<string, unknown>>): string {
  const direct = properties['c8y_ExternalId'];
  const parts: string[] = [];

  if (typeof direct === 'string') parts.push(direct);
  const external = properties['c8y_ExternalAsset'];

  if (external && typeof external === 'object') {
    for (const value of Object.values(external as Record<string, unknown>)) {
      if (typeof value === 'string' && value.length <= 64) parts.push(value);
    }
  }

  return parts.join(' ');
}

/**
 * The index over the whole cached fleet.
 *
 * Rebuilt from scratch whenever the store publishes a new hierarchy: at a few thousand
 * assets that is a handful of milliseconds, it happens at most once per poll, and it is off
 * the keystroke path entirely. If that ever stops being true, `MiniSearch` supports
 * `replace`/`discard` per document — `buildHierarchy` already reuses unchanged `AssetNode`
 * references, so the changed set is cheap to compute.
 */
export function buildAssetIndex(
  hierarchy: AssetHierarchy,
  indexableProperties: AssetIndexablePropertyMap = new Map(),
  options: { fallback?: boolean } = {}
): AssetSearchIndex {
  // `false` when the user turned the inventory fallback off and DTM is not available:
  // types DTM does not describe then index by name and path only, without guessed properties.
  const fallback = options.fallback ?? true;
  const index = new MiniSearch<AssetSearchDoc>({
    fields: [...SEARCH_FIELDS],
    storeFields: ['name', 'externalId', 'depth', 'turbineCount', 'severity', 'unavailable'],
    // `-` and `_` split, so "WTG-12" indexes as `wtg` + `12` and both halves are typeable.
    tokenize: (text) => text.split(/[\s\-_./,;:()[\]]+/u).filter(Boolean),
    processTerm: (term) => term.toLowerCase(),
  });

  const pathCache = new Map<string, string>();
  const pathOf = (node: AssetNode): string => {
    const cached = pathCache.get(node.id);

    if (cached !== undefined) return cached;
    const parent = node.parentId ? hierarchy.byId.get(node.parentId) : undefined;

    // The cache doubles as the cycle guard: a `childAssets` cycle (which `buildHierarchy`
    // faithfully reproduces) would otherwise walk parents forever.
    pathCache.set(node.id, '');
    const path = parent ? `${pathOf(parent)} ${parent.name}`.trim() : '';

    pathCache.set(node.id, path);

    return path;
  };

  const documents: AssetSearchDoc[] = [];

  for (const node of hierarchy.byId.values()) {
    const rollup = hierarchy.rollup.get(node.id);
    const severity = rollup?.worst ? (SEVERITY_RANK[rollup.worst] ?? 0) : 0;
    const unavailable = node.availability === 'unavailable' || (rollup?.unavailableCount ?? 0) > 0;
    const indexable =
      indexableProperties.get(node.type) ??
      (fallback ? fallbackIndexableProperties(node.properties) : []);
    const required: IndexableProperty[] = [];
    const optional: IndexableProperty[] = [];

    for (const property of indexable) (property.required ? required : optional).push(property);

    documents.push({
      id: node.id,
      name: node.name,
      externalId: externalIdOf(node.properties),
      type: `${node.type} ${assetTypeLabel(node.type)}`,
      path: pathOf(node),
      status: statusText(node, rollup?.worst ?? null),
      notes: typeof node.properties['c8y_Notes'] === 'string' ? node.properties['c8y_Notes'] : '',
      keyAttributes: indexableText(node.properties, required),
      attributes: indexableText(node.properties, optional),
      depth: node.depth,
      turbineCount: rollup?.turbineCount ?? 0,
      severity,
      unavailable,
    });
  }
  index.addAll(documents);

  return index;
}

/** Everything the ranking knows about the user, as opposed to about the fleet. */
export interface AssetSearchContext {
  /** Bookmarked assets — the strongest personal signal there is. */
  pinnedIds?: ReadonlySet<string>;
  /** Where the app already is; its ancestors are likelier targets than a stranger's. */
  currentId?: string | null;
}

export interface AssetSearchResult {
  /** Assets whose own text matched, unordered. */
  ids: Set<string>;
  /** The same assets, best first. Drives the overlay's results grid. */
  order: string[];
  /** `<mark>` ranges over `node.name`, for the matched assets only. */
  ranges: Map<string, MatchRange[]>;
  /** Which indexed property values matched, so a row can say *why* it matched. */
  matchedFields: Map<string, string[]>;
  /** No result matched literally — the UI says so rather than pretending these are hits. */
  fuzzy: boolean;
}

/**
 * Runs the three passes and ranks what comes back. `null` means "no search text" — the
 * caller should treat that as unfiltered rather than as an empty result.
 */
export function searchAssets(
  index: AssetSearchIndex | null,
  hierarchy: AssetHierarchy,
  query: { searchText: string; matchMode: MatchMode },
  context: AssetSearchContext = {}
): AssetSearchResult | null {
  const searchText = query.searchText.trim();

  if (!searchText) return null;

  const literal = literalPass(hierarchy, searchText, query.matchMode);
  const indexed = index ? indexedPass(index, searchText, query.matchMode) : null;

  // The index is the primary pass; the literal scan backfills the mid-token matches a
  // token index structurally cannot make ("mden" in "Emden"), which used to work.
  const merged = new Map<string, RankedHit>();

  for (const hit of indexed ?? []) merged.set(hit.id, hit);

  for (const hit of literal) {
    const existing = merged.get(hit.id);

    if (!existing) merged.set(hit.id, hit);
    else if (hit.tier < existing.tier) merged.set(hit.id, { ...existing, tier: hit.tier });
  }

  let fuzzy = false;
  let hits = [...merged.values()];

  if (!hits.length && searchText.length >= MIN_FUZZY_LENGTH && query.matchMode === 'contains') {
    // Nothing at all. Two fallbacks, subsequence first because its ranges are exact: it
    // covers *omissions* — an abbreviation ("wtg12" → "WTG 12"), a dropped space or
    // hyphen — and can point at the characters it matched.
    hits = subsequencePass(hierarchy, searchText);

    // Then, still nothing: widen the edit budget once. A *transposition* ("Emedn" for
    // "Emden") costs two edits under plain Levenshtein and is the most common typo there
    // is, so the stingy first pass cannot see it — and a subsequence cannot either, since
    // one wrong character makes every-character-present fail outright. Deliberately only
    // from here: two edits applied to a query that already has results turns a search into
    // a list of things the user did not ask for.
    if (!hits.length && index) {
      // Recall, then precision. MiniSearch only speaks Levenshtein, where a transposition
      // costs two edits — so the *query* budget stays wide (`ceil(len/3)`, capped) to let
      // "Emedn" reach "emden" at all. But two free Levenshtein edits turned a search into
      // a trawl ("auri" pulled back a third of a real fleet), so each hit is then
      // re-checked under OSA distance, where a transposition costs one: a term survives
      // one swap or one edit per four characters, not any two edits. Digits stay exact —
      // a numeric term is an identity, and every neighbour is a different asset.
      hits = indexedPass(index, searchText, 'contains', (term) =>
        /^\d+$/.test(term) ? 0 : Math.min(3, Math.ceil(term.length / 3))
      )
        .filter((hit) => withinTypoBudget(hit.terms, searchText))
        .map((hit) => ({ ...hit, tier: TIER_FUZZY_ONLY }));
    }
    fuzzy = hits.length > 0;
  }
  // Everything the index returned came from a prefix or fuzzy expansion, never from a term
  // the user actually typed — say so rather than presenting them as matches.
  if (!fuzzy && hits.length && hits.every((hit) => hit.tier === TIER_FUZZY_ONLY)) fuzzy = true;

  const pinned = context.pinnedIds ?? new Set<string>();
  const onCurrentPath = ancestorIds(hierarchy, context.currentId);

  const ranked = hits
    .map((hit) => {
      const node = hierarchy.byId.get(hit.id);

      if (!node) return null;
      const turbineCount = hierarchy.rollup.get(node.id)?.turbineCount ?? 0;
      return {
        hit,
        node,
        score: hit.score * documentBoost(node, turbineCount, pinned, onCurrentPath),
      };
    })
    .filter((entry): entry is { hit: RankedHit; node: AssetNode; score: number } => entry !== null)
    .sort(
      (a, b) =>
        a.hit.tier - b.hit.tier ||
        b.score - a.score ||
        // A stable tail matters: the grid re-renders on every 30-second poll, and two
        // equally-scored rows swapping places under the cursor reads as a glitch.
        a.node.name.localeCompare(b.node.name)
    );

  const ids = new Set<string>();
  const order: string[] = [];
  const ranges = new Map<string, MatchRange[]>();
  const matchedFields = new Map<string, string[]>();

  for (const entry of ranked) {
    ids.add(entry.node.id);
    order.push(entry.node.id);
    ranges.set(entry.node.id, highlightRanges(entry.node.name, searchText, entry.hit.terms));
    if (entry.hit.fields.length) matchedFields.set(entry.node.id, entry.hit.fields);
  }

  return { ids, order, ranges, matchedFields, fuzzy };
}

// ── passes ─────────────────────────────────────────────────────────────────────

/** Tiers, best first. The user expects what they literally typed above anything clever. */
const TIER_EXACT_NAME = 0;
const TIER_NAME_PREFIX = 1;
const TIER_NAME_WORD = 2;
const TIER_NAME_CONTAINS = 3;
const TIER_EXTERNAL_ID = 4;
const TIER_OTHER_FIELD = 5;
const TIER_FUZZY_ONLY = 6;

interface RankedHit {
  id: string;
  tier: number;
  score: number;
  /** Index terms this document matched — what {@link highlightRanges} marks. */
  terms: string[];
  /** Which fields matched, minus `name` — the "why did this row come back" hint. */
  fields: string[];
}

/**
 * The default per-term edit budget for the primary pass. `0.2` of the term's length —
 * MiniSearch *rounds*, so it only kicks in from 3 characters — except where an edit is
 * more likely to change identity than to fix a typo: terms of ≤3 characters ("013",
 * "t12") and all-digit terms of any length (a serial, a turbine number). Those match by
 * prefix only. This is what keeps "cuxhaven 013" at exactly turbine 013 instead of
 * 010–015.
 */
function defaultFuzziness(term: string): number {
  return term.length <= 3 || /^\d+$/.test(term) ? 0 : 0.2;
}

function indexedPass(
  index: AssetSearchIndex,
  searchText: string,
  matchMode: MatchMode,
  fuzziness: number | ((term: string) => number) = defaultFuzziness
): RankedHit[] {
  const results = index.search(searchText, {
    // `exact`/`startsWith` are literal modes — expanding them would contradict what the
    // user asked for. Only `contains` (the mode both containers use) gets the full engine.
    prefix: matchMode !== 'exact',
    fuzzy: matchMode === 'contains' ? fuzziness : false,
    combineWith: 'AND',
    boost: FIELD_BOOST,
    // A prefix or fuzzy expansion is a guess; it should never outscore the term as typed.
    weights: { fuzzy: 0.3, prefix: 0.6 },
  });

  const queryTerms = new Set(tokenize(searchText));
  const hits: RankedHit[] = [];

  for (const result of results) {
    const name = String(result['name'] ?? '');
    const externalId = String(result['externalId'] ?? '');

    if (matchMode === 'exact' && name.toLowerCase() !== searchText.toLowerCase()) continue;

    if (matchMode === 'startsWith' && !name.toLowerCase().startsWith(searchText.toLowerCase())) {
      continue;
    }
    const fields = new Set<string>();

    for (const matched of Object.values(result.match))
      for (const field of matched) fields.add(field);
    // A term the user typed, found verbatim in the index — as opposed to one MiniSearch
    // reached by prefix or edit distance.
    const literalTerm = result.terms.some((term) => queryTerms.has(term));

    hits.push({
      id: String(result.id),
      tier: nameTier(name, searchText, queryTerms, externalId, fields, literalTerm),
      score: result.score,
      terms: result.terms,
      fields: [...fields].filter((field) => field !== 'name'),
    });
  }

  return hits;
}

/**
 * The old behaviour, kept: a case-insensitive substring of the name, honouring
 * `matchMode`. Cheap, and the only pass that can match the middle of a token.
 */
function literalPass(
  hierarchy: AssetHierarchy,
  searchText: string,
  matchMode: MatchMode
): RankedHit[] {
  const needle = searchText.toLowerCase();
  const hits: RankedHit[] = [];

  for (const node of hierarchy.byId.values()) {
    const name = node.name.toLowerCase();
    const matched =
      matchMode === 'exact'
        ? name === needle
        : matchMode === 'startsWith'
          ? name.startsWith(needle)
          : name.includes(needle);

    if (!matched) continue;
    hits.push({
      id: node.id,
      tier: literalNameTier(node.name, searchText),
      // Below any indexed hit's boosted score by construction; the tier does the ordering
      // anyway, and this pass has no relevance model to contribute.
      score: 1,
      terms: [needle],
      fields: [],
    });
  }

  return hits;
}

/**
 * The precision half of the widened pass: every query term must be *plausibly* what one of
 * the hit's matched index terms was meant to say — a prefix of it (the as-you-type case),
 * or within an OSA edit distance of one swap-or-edit per four characters. OSA counts a
 * transposition as one edit where Levenshtein counts two, which is the entire point: the
 * common typo survives, the two-arbitrary-edits trawl does not.
 */
function withinTypoBudget(matchedTerms: readonly string[], searchText: string): boolean {
  return tokenize(searchText).every((term) => {
    const budget = Math.max(1, Math.floor(term.length / 4));
    return matchedTerms.some(
      (matched) => matched.startsWith(term) || osaDistance(term, matched) <= budget
    );
  });
}

/**
 * Optimal string alignment distance — Levenshtein plus adjacent transposition as a single
 * edit. Bounded inputs (index tokens), so the quadratic table is fine.
 */
function osaDistance(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const d = new Array<number>(rows * cols);

  for (let i = 0; i < rows; i++) d[i * cols] = i;
  for (let j = 0; j < cols; j++) d[j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        d[(i - 1) * cols + j] + 1,
        d[i * cols + (j - 1)] + 1,
        d[(i - 1) * cols + (j - 1)] + cost
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, d[(i - 2) * cols + (j - 2)] + 1);
      }
      d[i * cols + j] = best;
    }
  }

  return d[rows * cols - 1];
}

function subsequencePass(hierarchy: AssetHierarchy, searchText: string): RankedHit[] {
  const hits: RankedHit[] = [];

  for (const node of hierarchy.byId.values()) {
    if (!subsequenceRanges(node.name, searchText).length) continue;
    hits.push({ id: node.id, tier: TIER_FUZZY_ONLY, score: 1, terms: [], fields: [] });
  }

  return hits;
}

// ── ranking ────────────────────────────────────────────────────────────────────

function literalNameTier(name: string, searchText: string): number {
  const haystack = name.toLowerCase();
  const needle = searchText.toLowerCase();

  if (haystack === needle) return TIER_EXACT_NAME;
  if (haystack.startsWith(needle)) return TIER_NAME_PREFIX;
  if (new RegExp(`\\b${escapeRegExp(needle)}`, 'u').test(haystack)) return TIER_NAME_WORD;

  return haystack.includes(needle) ? TIER_NAME_CONTAINS : TIER_OTHER_FIELD;
}

function nameTier(
  name: string,
  searchText: string,
  queryTerms: ReadonlySet<string>,
  externalId: string,
  fields: ReadonlySet<string>,
  literalTerm: boolean
): number {
  const literalTier = literalNameTier(name, searchText);

  if (literalTier < TIER_OTHER_FIELD) return literalTier;
  // Multi-term queries rarely appear as one substring ("emden t12" is two tokens in
  // different places), so "every term is somewhere in the name" is still a name match.
  const haystack = name.toLowerCase();

  if (queryTerms.size > 1 && [...queryTerms].every((term) => haystack.includes(term))) {
    return TIER_NAME_CONTAINS;
  }

  if (externalId && externalId.toLowerCase().includes(searchText.toLowerCase())) {
    return TIER_EXTERNAL_ID;
  }
  if (!literalTerm) return TIER_FUZZY_ONLY;

  return fields.size ? TIER_OTHER_FIELD : TIER_FUZZY_ONLY;
}

/**
 * Multipliers on the relevance score, from what the asset *is* and what the user cares
 * about. Deliberately gentle — the tier ordering above decides the broad strokes, and
 * these only settle ties within a tier.
 */
function documentBoost(
  node: AssetNode,
  turbineCount: number,
  pinned: ReadonlySet<string>,
  onCurrentPath: ReadonlySet<string>
): number {
  let boost = 1;

  // The user already told us these matter.
  if (pinned.has(node.id)) boost *= 2.5;
  if (onCurrentPath.has(node.id)) boost *= 1.4;
  // A park is a better landing target than one of its sixty turbines when both match
  // equally — you can always go down, and going up costs a search.
  boost *= 1 + 0.12 * Math.max(0, 4 - node.depth);
  // …and a park with turbines in it is a bigger target than an empty one.
  boost *= 1 + 0.2 * Math.log10(1 + turbineCount);
  // Somebody searching mid-incident is usually hunting the thing that is broken.
  if (node.availability === 'unavailable') boost *= 1.1;

  return boost;
}

function ancestorIds(hierarchy: AssetHierarchy, currentId?: string | null): ReadonlySet<string> {
  const ancestors = new Set<string>();

  if (!currentId) return ancestors;
  let node = hierarchy.byId.get(currentId);

  // `ancestors` is the cycle guard as well as the result.
  while (node && !ancestors.has(node.id)) {
    ancestors.add(node.id);
    node = node.parentId ? hierarchy.byId.get(node.parentId) : undefined;
  }

  return ancestors;
}

// ── text matching (the `<mark>` ranges) ────────────────────────────────────────

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\-_./,;:()[\]]+/u)
    .filter(Boolean);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every occurrence of `needle` in `name`, honouring `matchMode`. Ordered and
 * non-overlapping, which is what `markSegments` requires.
 */
export function matchRanges(name: string, searchText: string, matchMode: MatchMode): MatchRange[] {
  if (!searchText) return [];
  const haystack = name.toLowerCase();
  const needle = searchText.toLowerCase();

  if (matchMode === 'exact') {
    return haystack === needle ? [{ start: 0, end: name.length }] : [];
  }

  if (matchMode === 'startsWith') {
    return haystack.startsWith(needle) ? [{ start: 0, end: needle.length }] : [];
  }
  const ranges: MatchRange[] = [];
  let from = 0;

  for (;;) {
    const at = haystack.indexOf(needle, from);

    if (at === -1) break;
    ranges.push({ start: at, end: at + needle.length });
    from = at + needle.length;
  }

  return ranges;
}

/**
 * Every character of `needle`, in order, anywhere in `name` — one range per run of
 * consecutive characters, so a run renders as one `<mark>` rather than one per letter.
 *
 * Greedy-leftmost rather than best-scoring: the job is "show me something plausible", not
 * "rank the fleet", and this keeps it O(name).
 */
export function subsequenceRanges(name: string, needle: string): MatchRange[] {
  if (needle.length < MIN_FUZZY_LENGTH) return [];
  const haystack = name.toLowerCase();
  const wanted = needle.toLowerCase();
  const ranges: MatchRange[] = [];
  let at = 0;

  for (const character of wanted) {
    // Whitespace in the term is a separator, not something to find — "t 12" should match
    // "Turbine 12", and a name has no space where the user put one.
    if (character === ' ') continue;
    const found = haystack.indexOf(character, at);

    if (found === -1) return [];
    const last = ranges[ranges.length - 1];

    if (last && last.end === found) last.end = found + 1;
    else ranges.push({ start: found, end: found + 1 });
    at = found + 1;
  }

  return ranges;
}

/**
 * What to `<mark>` in a matched row's name.
 *
 * The whole query first (so "north park" marks as one phrase where it appears as one),
 * then each matched term, then the subsequence fallback. Marking the matched *term*
 * rather than what the user typed is what makes a typo legible: "Ermden" marks `Emden`,
 * the word that was close — the honest rendering of why the row survived.
 *
 * A row that matched on its type, path or a property has nothing to mark in its name, and
 * gets no marks: inventing some would be a lie about why it is on screen.
 */
export function highlightRanges(
  name: string,
  searchText: string,
  terms: readonly string[]
): MatchRange[] {
  const collected = matchRanges(name, searchText, 'contains');

  for (const term of terms) collected.push(...matchRanges(name, term, 'contains'));
  const merged = mergeRanges(collected);
  return merged.length ? merged : subsequenceRanges(name, searchText);
}

/** Sorted, non-overlapping, adjacent runs joined — `markSegments`'s precondition. */
export function mergeRanges(ranges: readonly MatchRange[]): MatchRange[] {
  if (ranges.length < 2) return [...ranges];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged: MatchRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];

    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  return merged;
}
