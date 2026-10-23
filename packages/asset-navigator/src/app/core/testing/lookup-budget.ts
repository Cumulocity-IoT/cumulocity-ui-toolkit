import type { AssetHierarchy } from '../services/asset-store/asset-store.model';

/**
 * Test-only: an `AssetHierarchy` whose `byId` lookups are capped.
 *
 * Every walk over the hierarchy resolves nodes through `byId.get()`, so a walk that fails
 * to terminate blows the budget almost immediately and throws. That matters because the
 * loops these tests guard are **synchronous**: `testTimeout` cannot preempt a `while (true)`
 * in the same tick, so without a budget a regression would hang the whole run — CI would
 * eventually kill it with no indication of which walk is at fault. With one, the failure is
 * a named error on the offending test.
 *
 * Not exported from the library's `index.ts`, and `src/testing/**` is excluded from the
 * package build.
 */
class BudgetedMap<K, V> extends Map<K, V> {
  private remaining: number;

  constructor(entries: Iterable<readonly [K, V]>, budget: number) {
    super(entries);
    this.remaining = budget;
  }

  override get(key: K): V | undefined {
    if (this.remaining-- <= 0) {
      throw new Error(
        'byId lookup budget exhausted — a walk over the hierarchy is not terminating'
      );
    }

    return super.get(key);
  }
}

/**
 * `hierarchy` with a lookup budget. The default is generous next to the handful of nodes
 * these tests build, so only a non-terminating walk can exhaust it.
 */
export function withLookupBudget(hierarchy: AssetHierarchy, budget = 500): AssetHierarchy {
  return { ...hierarchy, byId: new BudgetedMap([...hierarchy.byId], budget) };
}
