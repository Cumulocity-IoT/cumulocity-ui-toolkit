import { SeriesResponse } from './chart-data.service';

/**
 * Minimum milliseconds a timestamp must lie in the past to be considered
 * settled. Used both for request eligibility (`dateFrom`) and for clamping
 * coverage records away from the live edge.
 */
export const MIN_HISTORICAL_MS = 5 * 60_000;

/**
 * Maximum age of a coverage record before the window it describes is treated
 * as uncovered again. Bounds how long deleted or backdated measurements can
 * be served from cache: after the TTL the window is refetched once and
 * re-covered. Data points themselves are kept — only the "fully fetched"
 * marker expires.
 */
export const COVERAGE_TTL_MS = 24 * 3_600_000;

/**
 * Clamps the end of a coverage interval so that no coverage is ever recorded
 * closer to `now` than {@link MIN_HISTORICAL_MS}. Data near the live edge may
 * still receive new (or backdated) measurements, so it must be refetched on
 * the next request rather than being marked as permanently covered.
 */
export function clampCoverageTo(from: Date, to: Date): Date {
  const limit = Date.now() - MIN_HISTORICAL_MS;
  return new Date(Math.max(from.getTime(), Math.min(to.getTime(), limit)));
}

/**
 * Returns a copy of `values` with keys sorted ascending (oldest first).
 * Verified against a live tenant: the series endpoint returns buckets oldest
 * first regardless of the `revert` parameter, so synthesized responses must
 * do the same. Consumers may rely on the key insertion order.
 */
export function orderValues<T>(values: Record<string, T>): Record<string, T> {
  const keys = Object.keys(values).sort();

  const ordered: Record<string, T> = {};

  for (const k of keys) ordered[k] = values[k];

  return ordered;
}

/**
 * Maps each column of a series response to its series key (`"type.name"`),
 * taken from the response's own `series` array. The spec ties `values[ts][i]`
 * to `series[i]` — NOT to the order of the request's `series` params — so the
 * request order is only a fallback when the response omits metadata.
 */
export function responseColumnKeys(body: SeriesResponse, requestedKeys: string[]): string[] {
  if (body.series?.length) {
    return body.series.map((s) => `${s.type}.${s.name}`);
  }

  return requestedKeys;
}
