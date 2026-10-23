import type { AlarmSeverityKey } from '../asset-store/asset-store.model';

/**
 * The one place a global-search query is turned into inventory query parameters.
 *
 * Every documented quirk of the query language is handled here and nowhere else, so a
 * caller cannot reintroduce one by accident. This is the assets/devices subset of the
 * `c8y-search` experiment's compiler — the alarm/event/operation and SQL compilers are
 * deliberately not ported (nothing here queries those collections).
 *
 * The language itself is the reason the search is shaped the way it is: it has **no
 * `like`, no `ne` and no regex**, and `text=` matches whole tokens through a stemmer.
 * Measured on a live tenant, `Rostock` returns 1 hit while `Rost` (prefix) and `Rostocl`
 * (typo) both return **0**. So the server can only ever narrow; typo tolerance has to run
 * in the browser over whatever came back (`fuzzy.service.ts`).
 *
 * Quirks encoded below:
 * - The standalone `type` parameter is **never** emitted. The platform silently ignores it
 *   whenever `query` is also present, so type always becomes `type eq '…'` inside `$filter`.
 * - Exact `eq` is case-**sensitive** while wildcard matching is case-insensitive. Values
 *   from an enumerated catalog (type chips) compile to a bare `eq`; free-typed text never
 *   reaches `$filter` at all — it goes to `text=`.
 * - Single quotes are **stripped**, not escaped: the language documents no escape sequence.
 * - Nothing here orders results (the ranker does), but if `$orderby` is ever added it
 *   belongs **inside** `query`, space-joined onto `$filter` — never as a second HTTP
 *   parameter. Same trap `AssetStoreService.sweepQuery` documents.
 * - `withChildren=false` is what the platform itself recommends for query performance.
 */

/** What a global search asks for. Text is never exact-matched; it drives `text=`. */
export interface SearchQuery {
  /** Free-typed text. Goes to `text=`, then gets re-ranked locally. */
  text?: string;
  /** Managed-object types, OR'd with each other and AND'd against everything else. */
  typeChips?: readonly string[];
  /**
   * Objects at or below any of these assets in the hierarchy — the "search inside Husum" chip.
   * Compiles to `isinhierarchyof`, which matches the object itself and all its descendants.
   */
  scopeIds?: readonly string[];
  /** Objects with at least one *active* alarm of these severities. */
  activeAlarmSeverities?: readonly AlarmSeverityKey[];
  /** Restrict to devices (`c8y_IsDevice`). */
  onlyDevices?: boolean;
  /** Restrict to assets (`c8y_IsAsset`). */
  onlyAssets?: boolean;
  /**
   * Restrict to things a person would search for — assets or devices.
   *
   * The inventory also holds application archives, microservice manifests, dashboards,
   * binaries, user preferences and template instances. They are managed objects like any
   * other, so without this they flood both the results and the type chips.
   */
  onlyAssetsOrDevices?: boolean;
  page?: { size?: number; current?: number };
}

export interface CompileOptions {
  /** Ask for the total element count. Off by default because it is expensive. */
  withTotalElements?: boolean;
  /** Include ancestors so a row can render a breadcrumb. Defaults to true. */
  withParents?: boolean;
}

export interface CompiledInventoryQuery {
  /** Ready for `new URLSearchParams(params)`; values are unencoded. */
  params: Record<string, string>;
  /** The `$filter` body without the keyword, or undefined when unfiltered. */
  filter?: string;
}

/** The platform silently trims anything above this, and rejects below 1. */
export const MAX_PAGE_SIZE = 2000;

/** The platform's own default is 5, which is almost never what a search wants. */
export const DEFAULT_PAGE_SIZE = 100;

export function clampPageSize(size: number | undefined): number {
  if (size === undefined || Number.isNaN(size)) return DEFAULT_PAGE_SIZE;

  return Math.min(Math.max(Math.trunc(size), 1), MAX_PAGE_SIZE);
}

/**
 * Single quotes terminate a string literal and the query language documents no escape
 * sequence, so they are removed rather than passed through. Control characters go too.
 */
function sanitizeStringLiteral(value: string): string {
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point of this regex
  return value.replace(/'/g, '').replace(/[\u0000-\u001f\u007f]/g, '');
}

export function compileToInventoryParams(
  query: SearchQuery,
  options: CompileOptions = {}
): CompiledInventoryQuery {
  const terms: string[] = [];

  const types = (query.typeChips ?? [])
    .map(sanitizeStringLiteral)
    .filter((type) => type.length > 0);

  if (types.length > 0) {
    // Type chips always come from an enumerated catalog, so exact `eq` is correct here.
    const typeTerms = types.map((type) => `type eq '${type}'`);

    terms.push(typeTerms.length === 1 ? typeTerms[0] : `(${typeTerms.join(' or ')})`);
  }

  // Ids are numeric strings; anything else is not an id and must not reach the filter.
  const scopes = (query.scopeIds ?? []).filter((id) => /^\d+$/.test(id));

  if (scopes.length > 0) {
    const scopeTerms = scopes.map((id) => `isinhierarchyof(${id})`);

    terms.push(scopeTerms.length === 1 ? scopeTerms[0] : `(${scopeTerms.join(' or ')})`);
  }

  if (query.onlyDevices) terms.push('has(c8y_IsDevice)');
  if (query.onlyAssets) terms.push('has(c8y_IsAsset)');
  if (query.onlyAssetsOrDevices) terms.push('(has(c8y_IsAsset) or has(c8y_IsDevice))');

  const severities = query.activeAlarmSeverities ?? [];

  if (severities.length > 0) {
    // Read off the fragment the platform maintains on the object itself, so this is an
    // ordinary inventory filter that composes with the rest in one request. Walking the
    // alarm collection instead cannot answer it: no `distinct`, one `source` per request.
    // Counts are integers, so no `f` suffix; `gt 0` reads "has at least one".
    const alarmTerms = severities.map((severity) => `c8y_ActiveAlarmsStatus.${severity} gt 0`);

    terms.push(alarmTerms.length === 1 ? alarmTerms[0] : `(${alarmTerms.join(' or ')})`);
  }

  const params: Record<string, string> = {
    pageSize: String(clampPageSize(query.page?.size)),
    currentPage: String(Math.max(Math.trunc(query.page?.current ?? 1), 1)),
    withChildren: 'false',
    skipChildrenNames: 'true',
  };

  if (options.withParents ?? true) params['withParents'] = 'true';
  if (options.withTotalElements) params['withTotalElements'] = 'true';

  // Free text goes to the dedicated `text` parameter, which tokenizes across
  // id/type/name/owner/externalIds. Faking it inside `$filter` would be strictly worse —
  // there is no `like` to fake it with.
  const text = query.text?.trim();

  if (text) params['text'] = text;

  const filter = terms.length > 0 ? terms.join(' and ') : undefined;

  if (filter) {
    params['query'] = `$filter=${terms.length > 1 ? `(${filter})` : filter}`;
  }

  return filter ? { params, filter } : { params };
}

/** Serializes compiled parameters into a query string with correct encoding. */
export function toQueryString(compiled: CompiledInventoryQuery): string {
  return new URLSearchParams(compiled.params).toString();
}
