/**
 * Registry that collects Cypress test IDs across all `describe` blocks within
 * a spec run.  It is used in conjunction with the global `after()` hook in
 * `e2e.ts` to clean up managed objects after all tests in a spec have run.
 *
 * Isolation between test configs is provided by each Cypress config's
 * `specPattern` — only specs matching the pattern execute, so only their
 * test IDs are registered.  Running the charts config therefore only
 * accumulates chart test IDs, the devices config only device test IDs, etc.
 *
 * @example
 * // In a spec file:
 * const CYPRESS_TEST_ID = 'My widget';
 * registerTestId(CYPRESS_TEST_ID);
 */
class TestIdRegistry {
  private readonly ids: Set<string> = new Set();

  register(id: string): void {
    this.ids.add(id);
  }

  getAll(): ReadonlySet<string> {
    return this.ids;
  }
}

export const testIdRegistry = new TestIdRegistry();

/**
 * Registers `id` so it will be cleaned up by the global `after()` hook.
 * Call this once per `describe` block, right after declaring `CYPRESS_TEST_ID`.
 */
export function registerTestId(id: string): void {
  testIdRegistry.register(id);
}
