/**
 * Tenant-mock shim for the asset-navigator plugin.
 *
 * The plugin pages the inventory with the query-language field `_id`
 * (`$filter=(_id gt '0' and …) $orderby=_id asc`, `$filter=(_id eq '<id>')`), which the real
 * platform supports. The ui-sdk emulator only knows the alias `id` and answers `_id` filters
 * with an empty page. Rewrite `_id` → `id` before the request reaches the mock so the tree and
 * the search see the world. Harmless against a real tenant (`id` is accepted there as well).
 */
export function interceptAssetNavigatorInventoryQueries(): void {
  cy.intercept({ method: 'GET', pathname: '/inventory/managedObjects' }, (req) => {
    const query = req.query['query'];
    if (typeof query === 'string' && query.includes('_id')) {
      req.query['query'] = query.replace(/\b_id\b/g, 'id');
    }
  });
}
