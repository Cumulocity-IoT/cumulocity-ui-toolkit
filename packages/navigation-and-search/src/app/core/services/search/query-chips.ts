import { gettext } from '@c8y/ngx-components/gettext';
import { ALARM_SEVERITIES, type AlarmSeverityKey } from '../asset-store/asset-store.model';
import type { SearchQuery } from './inventory-query';
import type { SearchResult } from './search.model';

/**
 * The query builder behind the global search's input: chips plus free text.
 *
 * A chip is one structured condition, shown inside the input and removable as a unit. The
 * input's own text is the rest of the query — it is ranked fuzzily, never compiled to a filter.
 * Chips on the **same** field are OR'd (two parks means "either"), chips on different fields
 * AND'd, and the text AND'd against all of them. That is the whole grammar; the compilers
 * (`SearchCorpusService.filter` locally, `compileToInventoryParams` for the platform) implement
 * it identically, so the mode switch changes latency, not the answer.
 *
 * Pure on purpose — no Angular, no `@c8y/ngx-components` beyond `gettext` — so the parsing and
 * the suggestion order are Vitest-tested. Design: `docs/GlobalSearch/spec.md` §10.
 */

export type ChipField = 'in' | 'type' | 'alarm';

export interface QueryChip {
  field: ChipField;
  /** What the condition compares against: an asset id, a type, a severity. */
  value: string;
  /** What the chip shows. For `in` the asset's name, for `type` the catalog label. */
  label: string;
  /** The asset type's icon, shown in the chip as it was in the row that offered it. */
  icon?: string;
}

/** A chip the filter rows offer, with what the reader needs to choose between look-alikes. */
export interface ChipSuggestion {
  chip: QueryChip;
  /** Disambiguation shown next to the chip — a scope's breadcrumb, a type's result count. */
  detail?: string;
  /** A scope's type, as the catalog labels it; humanized at render time like the type chips. */
  typeLabel?: string;
  /**
   * The text plainly names this — a place it equals or starts a word of, a type label it
   * starts, a severity prefix. Only such a suggestion may take the default highlight, so Enter
   * adds it; a looser one ("wtg04" inside "ROWTG04 · Nordex", a place outside the current scope,
   * a type the results happen to share) is offered and Enter still opens the top result.
   */
  strong?: boolean;
  /**
   * What is left in the input once this chip is added. A suggestion reading the whole text uses
   * it all up (`''`); one reading a single word removes just that word ("nordex rostock" →
   * `In: Rostock` leaves "nordex"); a type offered because the results share it narrows the text
   * and leaves it whole ("ves" → `Type: Wind turbine` keeps "ves").
   */
  remainder: string;
  icon?: string;
}

/** A place a scope chip can point at, and whether the term plainly names it. */
export interface RankedScope {
  scope: SearchResult;
  strong: boolean;
}

/** One asset-type option, from the definition catalog or seen in results. */
export interface TypeOption {
  type: string;
  label: string;
  icon?: string;
}

/**
 * What a reader may type before the colon. `asset:` and `type:` are the same filter — the
 * asset *type* — and both are accepted because both are what people reach for.
 */
export const FIELD_ALIASES: Readonly<Record<string, ChipField>> = {
  in: 'in',
  type: 'type',
  asset: 'type',
  alarm: 'alarm',
  alarms: 'alarm',
};

export const FIELD_LABELS: Readonly<Record<ChipField, string>> = {
  in: gettext('In'),
  type: gettext('Type'),
  alarm: gettext('Alarm'),
};

/** Scope suggestions shown at once; more than this is a list, not a choice. */
const MAX_SCOPE_SUGGESTIONS = 5;
/** Per single-word reading — the whole text's readings come first and get the room. */
const MAX_WORD_SUGGESTIONS = 3;
/**
 * Text shorter than this, or all digits, is never read as a place — neither the whole input nor
 * one word of it. "4" or "T4" would name half the fleet (any turbine with sub-assets is a place),
 * and as text the number rule (`preferNumberIdentity`) is what makes them useful.
 */
const MIN_PLACE_READING = 3;
const MAX_TYPE_SUGGESTIONS = 4;
/** With an explicit `type:` the reader is browsing the types, so show more of them. */
const MAX_TYPE_BROWSE = 8;

/**
 * Lowercase with every separator dropped, so "wind turbine", "wind_turbine" and "WindTurbine"
 * compare equal — type identifiers and their labels disagree on all three.
 */
function compact(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

/**
 * Reads `field:value` off the input, or `undefined` when the text is not a field expression.
 * Only known aliases count, so "T4: gearbox" stays free text.
 */
export function parseFieldExpression(
  text: string
): { field: ChipField; value: string } | undefined {
  const match = /^\s*([a-z]+)\s*:\s*(.*)$/i.exec(text);

  if (!match) return undefined;
  const field = FIELD_ALIASES[match[1].toLowerCase()];
  return field ? { field, value: match[2].trim() } : undefined;
}

/**
 * The part of the input that is a free-text search term. A half-typed field expression is a
 * filter being built, not something to rank names against — so it contributes nothing.
 */
export function freeTextOf(text: string): string {
  return parseFieldExpression(text) ? '' : text.trim();
}

export function sameChip(a: QueryChip, b: QueryChip): boolean {
  return a.field === b.field && a.value === b.value;
}

/**
 * The places a scope chip can point at, for this term, best first.
 *
 * Deliberately **not** fuzzy: a scope is a place the reader is naming, and a typo-tolerant
 * matcher offered "PV Subsystem" for "Husum" because "Subsy…" is a couple of edits away. Every
 * word of the term must appear in the name. Then: exact name, name starts with the term, a word
 * starts with it, contains it — and on a tie the higher-level asset first, because "Husum" the
 * site is a better scope than "Husum Substation" below it.
 *
 * With scope chips already applied, candidates inside them come first — the reader is drilling
 * down — and the rest only when nothing inside matches, which keeps adding a second park (OR)
 * possible without letting the whole fleet crowd out the drill-down.
 */
export function rankScopes(
  candidates: readonly SearchResult[],
  term: string,
  within: readonly string[] = []
): RankedScope[] {
  const words = term
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) return [];
  const whole = words.join(' ');
  const wordStart = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(whole)}`, 'u');

  const scored: Array<{ scope: SearchResult; score: number; depth: number; inside: boolean }> = [];

  for (const scope of candidates) {
    const name = scope.name.toLowerCase();

    if (!words.every((word) => name.includes(word))) continue;
    const score = name === whole ? 0 : name.startsWith(whole) ? 1 : wordStart.test(name) ? 2 : 3;
    const ancestors = scope.ancestorIds ?? [];
    const inside = within.some((id) => ancestors.includes(id));

    scored.push({ scope, score, depth: ancestors.length, inside });
  }

  const pool = scored.some((entry) => entry.inside)
    ? scored.filter((entry) => entry.inside)
    : scored;
  return pool
    .sort(
      (a, b) => a.score - b.score || a.depth - b.depth || a.scope.name.localeCompare(b.scope.name)
    )
    .map((entry) => ({
      scope: entry.scope,
      // Outside an applied scope is the fallback, never the confident reading.
      strong: entry.score <= 2 && (within.length === 0 || entry.inside),
    }));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The chips the filter rows offer for the current input, best first.
 *
 * Free text offers every reading of the word, so an ambiguous one becomes a choice rather than
 * a guess:
 *
 * 1. **Types whose name contains it** — "wind" most likely means the kind of thing.
 * 2. **Places to search inside**, from `scopesFor` ({@link rankScopes} in the palette).
 * 3. A severity, on a prefix of its name.
 *
 * That is done for the **whole text** first and then for **each word on its own**, last word
 * first, so a filter can be pulled out of a search already under way: "nordex rostock" names no
 * place, but its last word does, and `In: Rostock` leaves "nordex" in the input. Then:
 *
 * 4. **Types the matching results share** (at least two) — "nordex" names no type, but if every
 *    match is a wind turbine, narrowing to wind turbines is the useful next step. These keep
 *    the whole text.
 *
 * There is no name chip — the free text already searches names (spec §10). An explicit `field:`
 * narrows the offer to that field, its value may be followed by more search, and `type:`/`alarm:`
 * with no value browse.
 */
export function suggestChips(
  text: string,
  existing: readonly QueryChip[],
  sources: {
    types: readonly TypeOption[];
    /** Places matching a term, best first ({@link rankScopes}). */
    scopesFor: (term: string) => readonly RankedScope[];
    /** How many current results carry each type. */
    resultTypes?: ReadonlyMap<string, number>;
    typeLabel?: (type: string) => string;
  }
): ChipSuggestion[] {
  const count = (type: string) => sources.resultTypes?.get(type) ?? 0;
  const typeOption = (
    option: TypeOption,
    remainder: string,
    strong: boolean,
    detail?: number
  ): ChipSuggestion => ({
    chip: { field: 'type', value: option.type, label: option.label },
    remainder,
    strong,
    ...(option.icon ? { icon: option.icon } : {}),
    ...(detail !== undefined ? { detail: String(detail) } : {}),
  });

  /** Every chip `term` could mean, restricted to `field` when one was typed. */
  const read = (
    term: string,
    field: ChipField | undefined,
    remainder: string,
    limit: number
  ): ChipSuggestion[] => {
    const out: ChipSuggestion[] = [];
    const needle = compact(term);

    // Punctuation alone ("-", "///") compacts to nothing; without a typed field it means nothing,
    // and an empty needle would otherwise match every type.
    if (!field && needle.length === 0) return out;

    if (!field || field === 'type') {
      // Most matching results first: in a scope, "wind" should lead with the 14 turbines, not
      // the one subsystem the catalog lists first. A stable sort keeps catalog order on ties.
      const matching = sources.types
        .filter(
          (option) =>
            needle.length === 0 ||
            compact(option.label).includes(needle) ||
            compact(option.type).includes(needle)
        )
        .sort((a, b) => count(b.type) - count(a.type));
      const take = field ? MAX_TYPE_BROWSE : Math.min(limit, MAX_TYPE_SUGGESTIONS);

      for (const option of matching.slice(0, take)) {
        const strong =
          !!field ||
          (needle.length >= MIN_PLACE_READING &&
            (compact(option.label).startsWith(needle) || compact(option.type).startsWith(needle)));

        out.push(typeOption(option, remainder, strong, sources.resultTypes?.get(option.type)));
      }
    }

    const placeLike = term.length >= MIN_PLACE_READING && !/^\d+$/.test(term);

    if ((!field || field === 'in') && (field === 'in' ? term.length > 0 : placeLike)) {
      for (const { scope, strong } of sources.scopesFor(term).slice(0, limit)) {
        out.push({
          chip: { field: 'in', value: scope.id, label: scope.name },
          remainder,
          strong,
          typeLabel: sources.typeLabel?.(scope.type) ?? scope.type,
          ...(scope.breadcrumb.length > 0 ? { detail: scope.breadcrumb.join(' › ') } : {}),
        });
      }
    }

    if (!field || field === 'alarm') {
      for (const severity of ALARM_SEVERITIES) {
        if (needle.length === 0 ? field === 'alarm' : severity.startsWith(needle)) {
          out.push({
            chip: { field: 'alarm', value: severity, label: severity },
            remainder,
            strong: field === 'alarm' || needle.length >= MIN_PLACE_READING,
          });
        }
      }
    }

    return out;
  };

  const suggestions: ChipSuggestion[] = [];
  const expression = parseFieldExpression(text);
  const whole = text.trim();

  if (expression) {
    // "in:husum nordex" — the value may be followed by more search. Try the longest run of words
    // first, so a multi-word value ("type:wind turbine") still reads whole, and leave the rest.
    const words = expression.value.split(/\s+/).filter((word) => word.length > 0);

    if (words.length === 0)
      suggestions.push(...read('', expression.field, '', MAX_SCOPE_SUGGESTIONS));

    for (let k = words.length; k > 0; k--) {
      suggestions.push(
        ...read(
          words.slice(0, k).join(' '),
          expression.field,
          words.slice(k).join(' '),
          MAX_SCOPE_SUGGESTIONS
        )
      );
    }
  } else if (whole.length > 0) {
    suggestions.push(...read(whole, undefined, '', MAX_SCOPE_SUGGESTIONS));

    const words = whole.split(/\s+/);

    if (words.length > 1) {
      for (let i = words.length - 1; i >= 0; i--) {
        const word = words[i];

        // A short word or a number in a longer search is part of the search, not a filter.
        if (word.length < MIN_PLACE_READING || /^\d+$/.test(word)) continue;
        const remainder = words.filter((_, j) => j !== i).join(' ');

        suggestions.push(...read(word, undefined, remainder, MAX_WORD_SUGGESTIONS));
      }
    }

    if (sources.resultTypes) {
      const byType = new Map(sources.types.map((option) => [option.type, option]));
      const fromResults = [...sources.resultTypes.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1]);

      for (const [type, n] of fromResults.slice(0, MAX_TYPE_SUGGESTIONS)) {
        suggestions.push(
          typeOption(
            byType.get(type) ?? { type, label: sources.typeLabel?.(type) ?? type },
            whole,
            false,
            n
          )
        );
      }
    }
  }

  // One row per chip: the first reading wins, which is the one that uses up the most text.
  const seen: QueryChip[] = [...existing];
  return suggestions.filter((suggestion) => {
    if (seen.some((chip) => sameChip(chip, suggestion.chip))) return false;
    seen.push(suggestion.chip);

    return true;
  });
}

/**
 * Adds a chip unless an identical one is already applied.
 *
 * A place nested in (or containing) an applied place **replaces** it: chips on one field are OR'd,
 * so `In: Rostock` + `In: Rostock Substation` would still be all of Rostock and the drill-down
 * would do nothing. `ancestorsOf` answers a place's ancestor ids; without it, chips only accumulate.
 */
export function addChip(
  chips: readonly QueryChip[],
  chip: QueryChip,
  ancestorsOf?: (id: string) => readonly string[]
): QueryChip[] {
  if (chips.some((existing) => sameChip(existing, chip))) return [...chips];
  if (chip.field !== 'in' || !ancestorsOf) return [...chips, chip];
  const above = ancestorsOf(chip.value);
  const nested = (existing: QueryChip) =>
    existing.field === 'in' &&
    (above.includes(existing.value) || ancestorsOf(existing.value).includes(chip.value));
  return [...chips.filter((existing) => !nested(existing)), chip];
}

/** Compiles chips plus free text into the query both candidate sources understand. */
export function toSearchQuery(chips: readonly QueryChip[], freeText: string): SearchQuery {
  const values = (field: ChipField) =>
    chips.filter((chip) => chip.field === field).map((chip) => chip.value);
  const text = freeText.trim();
  const scopeIds = values('in');
  const typeChips = values('type');
  const severities = values('alarm') as AlarmSeverityKey[];

  return {
    ...(text.length > 0 ? { text } : {}),
    ...(scopeIds.length > 0 ? { scopeIds } : {}),
    ...(typeChips.length > 0 ? { typeChips } : {}),
    ...(severities.length > 0 ? { activeAlarmSeverities: severities } : {}),
  };
}
