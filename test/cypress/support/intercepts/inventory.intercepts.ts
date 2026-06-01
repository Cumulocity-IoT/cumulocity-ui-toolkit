import { IManagedObject } from '@c8y/client';
import { mockChildAssetsResponse } from '../factories/list-response.factory';
import { mockDevice } from '../factories/managed-object.factory';
import { mockListResponse } from '../factories/list-response.factory';

/**
 * Stubs all standard GET variants for a single managed object so the app
 * can navigate to a device page without a real backend.
 *
 * Intercepted routes:
 * - `GET inventory/managedObjects/{id}`
 * - `GET inventory/managedObjects/{id}?withChildren=false`
 * - `GET inventory/managedObjects/{id}?withParents=true`
 * - `GET inventory/managedObjects/{id}/childDevices*`  (returns empty list)
 */
export function mockInventoryObject(id: string, content: Partial<IManagedObject>): void {
  cy.intercept('GET', `inventory/managedObjects/${id}?withChildren=false`, { ...content });
  cy.intercept('GET', `inventory/managedObjects/${id}?withParents=true`, { ...content });
  cy.intercept('GET', `inventory/managedObjects/${id}`, { ...content });
  cy.intercept('GET', `inventory/managedObjects/${id}/childDevices*`, {
    ...mockChildAssetsResponse([], { pageSize: 1, currentPage: 1 }),
  });
}

/**
 * Stubs all standard GET variants for a group managed object **and** its
 * child assets/devices list so the app can navigate to a group page.
 *
 * Intercepted routes (in addition to the base ones from {@link mockInventoryObject}):
 * - `GET inventory/managedObjects/{id}/childDevices*`  (returns `children`)
 * - `GET inventory/managedObjects/{id}/childAssets*`   (returns `children`)
 */
export function mockInventoryGroup(
  group: Partial<IManagedObject>,
  children: IManagedObject[] = []
): void {
  cy.intercept('GET', `inventory/managedObjects/${group.id}?withChildren=false`, { ...group });
  cy.intercept('GET', `inventory/managedObjects/${group.id}?withParents=true`, { ...group });
  cy.intercept('GET', `inventory/managedObjects/${group.id}`, { ...group });
  cy.intercept('GET', `inventory/managedObjects/${group.id}/childDevices*`, {
    ...mockChildAssetsResponse(children, { pageSize: 1, currentPage: 1 }),
  });
  cy.intercept('GET', `inventory/managedObjects/${group.id}/childAssets*`, {
    ...mockChildAssetsResponse(children, { pageSize: 1, currentPage: 1 }),
  });
}

/**
 * Stubs the Gainsight managed-object lookup so it never blocks page load in
 * tests. Should be called once in `before()` or `beforeEach()`.
 */
export function interceptAndMockGainsight(): void {
  const mock = mockDevice();

  cy.intercept('GET', 'inventory/managedObjects?fragmentType=gainsight*', (req) => {
    const fragment = { ...mock, type: 'c8y_UserPreference', [req.query.fragmentType]: false };
    req.reply({ statusCode: 200, body: mockListResponse([fragment]) });
  });

  cy.intercept('GET', `inventory/managedObjects/${mock.id}`, { ...mock });
}
