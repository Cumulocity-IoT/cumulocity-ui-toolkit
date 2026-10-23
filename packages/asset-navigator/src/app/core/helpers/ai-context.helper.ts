/**
 * Projection helpers shared by everything that reports into the AI context store.
 * Keeping them here rather than in each plugin keeps the shape of a reported list
 * identical across views and widgets — the agent sees one convention.
 */

/** A list capped for the prompt: `limit` entries plus what was dropped. */
export interface CappedList<T> {
  items: T[];
  /** Length before capping, so the agent knows the real size. */
  total: number;
  truncated: boolean;
}

/**
 * Caps a list before it goes into the prompt. Never send an unbounded collection:
 * the context is re-serialized on every change and lands in durable chat history.
 */
export function cappedList<T>(
  items: readonly T[] | null | undefined,
  limit: number
): CappedList<T> {
  const all = items || [];

  return {
    items: all.slice(0, limit),
    total: all.length,
    truncated: all.length > limit,
  };
}

/**
 * The same, from the **other end** — the last `limit` entries, in their original order.
 *
 * For a list the view itself shows the tail of. A chronological list is the usual case: the
 * screen shows the most recent rows, and capping from the front would hand the agent the oldest
 * ones instead, so it would answer about readings the user cannot see. Which end a projection
 * caps from has to match which end the view keeps.
 *
 * `total` and `truncated` still describe the whole collection, not the slice.
 */
export function cappedTail<T>(
  items: readonly T[] | null | undefined,
  limit: number
): CappedList<T> {
  const all = items || [];

  return {
    // Not `slice(-limit)`: with a limit of 0 that is `slice(0)`, the entire list.
    items: limit > 0 ? all.slice(Math.max(0, all.length - limit)) : [],
    total: all.length,
    truncated: all.length > limit,
  };
}

/**
 * Counts items by a derived key — the standard way to summarize the entries that
 * a {@link cappedList} left out (e.g. status distribution over a whole result set).
 */
export function countBy<T>(
  items: readonly T[] | null | undefined,
  key: (item: T) => string
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const item of items || []) {
    const bucket = key(item);

    counts[bucket] = (counts[bucket] || 0) + 1;
  }

  return counts;
}
