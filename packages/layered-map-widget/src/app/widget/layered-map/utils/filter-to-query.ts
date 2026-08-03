import { QueriesUtil } from '@c8y/client';
import { QueryJson } from '~components/query-display/reverse-queries-util.model';
import { ReverseQueriesUtil } from '~components/query-display/reverse-queries-util';

const queriesUtil = new QueriesUtil();
const reverseUtil = new ReverseQueriesUtil();

/**
 * Converts a Cumulocity inventory filter object (as stored in
 * `QueryLayerConfig.filter`) into an OData-style query clause string for
 * display with the `ps-query-display` component.
 *
 * Each filter key is mapped to the appropriate `QueryJson` shape and the
 * clauses are combined with `__and` before being serialised via
 * `QueriesUtil.buildQuery()`. This delegates escaping and operator formatting
 * to the SDK rather than hand-rolling string concatenation.
 *
 * Recognised keys:
 * - `query`        — an existing `$filter=(…)` or bare clause; parsed via
 *                    `ReverseQueriesUtil` and inlined verbatim
 * - `fragmentType` — mapped to `has(<value>)`
 * - `ids`          — comma-separated id list mapped to `id in (…)`
 * - everything else — mapped to `<key> eq <value>` (numeric values without quotes)
 *
 * @param filter Record of filter parameters from `QueryLayerConfig.filter`.
 *   `null`/`undefined`/empty-string values are skipped.
 * @returns A bare clause string (no `$filter=` wrapper), or `''` when there
 *   are no meaningful entries.
 */
export function filterToQueryString(filter: Record<string, unknown>): string {
  const clauses: QueryJson[] = [];

  for (const [key, raw] of Object.entries(filter ?? {})) {
    if (raw === undefined || raw === null || raw === '') {
      continue;
    }

    if (key === 'query' && typeof raw === 'string') {
      const parsed = reverseUtil.buildQueryJSON(raw);

      if (parsed) {
        clauses.push(parsed);
      }

      continue;
    }

    if (key === 'fragmentType' && typeof raw === 'string') {
      clauses.push({ __has: raw });
      continue;
    }

    if (key === 'ids' && typeof raw === 'string') {
      clauses.push({ id: { __in: raw.split(',').map((id) => id.trim()) } });
      continue;
    }

    // Everything else: primitives map to key eq value (eq is implicit in QueryJson)
    if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
      clauses.push({ [key]: raw });
    }
  }

  if (clauses.length === 0) {
    return '';
  }

  const queryJson: QueryJson = clauses.length === 1 ? clauses[0] : { __and: clauses };
  const withWrapper = queriesUtil.buildQuery(queryJson);

  return unwrapFilter(withWrapper);
}

/**
 * Strips a leading `$filter=` prefix and one layer of surrounding parentheses
 * from a query string produced by `QueriesUtil.buildQuery()`.
 *
 * @example
 * unwrapFilter("$filter=(type eq 'Pump')")  // → "type eq 'Pump'"
 * unwrapFilter("(type eq 'Pump')")           // → "type eq 'Pump'"
 * unwrapFilter("type eq 'Pump'")             // → "type eq 'Pump'"
 */
export function unwrapFilter(query: string): string {
  let result = query.trim();

  if (result.startsWith('$filter=')) {
    result = result.slice('$filter='.length).trim();
  }

  if (result.startsWith('(') && result.endsWith(')')) {
    result = result.slice(1, -1).trim();
  }

  return result;
}
