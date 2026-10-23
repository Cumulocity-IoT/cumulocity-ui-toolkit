/// <reference types="cypress" />

/**
 * Index DB Cache e2e — runs against the tenant mock (windy-dev world).
 *
 * Features:
 *  - action-bar toggle (on every route) opening / closing the cache drawer
 *  - "Caching active" switch, persisted in localStorage (`c8y-idb-cache-active`, default on)
 *  - "Cancel requests on navigation" switch, persisted (`c8y-idb-abort-on-navigation`, default off)
 *  - statistics table (3 caches) + "Clear all caches"
 *  - live log (empty state, clear log)
 *
 * Not covered: the HTTP interceptors filling the cache. They only act on measurement
 * list / series requests issued through the ngx ApiService (e.g. by chart widgets on a
 * dashboard); the mock world has no dashboards and cockpit issues no such request on
 * its own, so there is no stable UI path to trigger them. Their logic is unit-tested.
 */

const TOGGLE = '[data-cy="index-db-cache--toggle"]';
const DRAWER = '#collapseCache';
const ACTIVE_TOGGLE = '[data-cy="index-db-cache--active-toggle"]';
const ABORT_TOGGLE = '[data-cy="index-db-cache--abort-toggle"]';
const ACTIVE_STATE = '[data-cy="index-db-cache--active-state"]';

function openDrawer() {
  cy.visitShellAndWaitForSelector('', 'en', TOGGLE);
  cy.get(TOGGLE).click();
  cy.get(DRAWER).should('be.visible');
}

describe('Index DB Cache Plugin', () => {
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
    cy.clearLocalStorage();
  });

  it('shows the cache action bar button and opens / closes the drawer', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');

    cy.get(DRAWER).should('not.be.visible');
    cy.get(TOGGLE).should('be.visible').and('have.attr', 'aria-expanded', 'false').click();

    cy.get(DRAWER).should('be.visible').and('contain', 'IndexedDB Cache');
    cy.get(TOGGLE).should('have.attr', 'aria-expanded', 'true');

    cy.get('[data-cy="index-db-cache--close"]').should('be.visible').click();
    cy.get(DRAWER).should('not.be.visible');
  });

  it('is available on device pages as well', () => {
    cy.request('/inventory/managedObjects?fragmentType=c8y_IsDevice&pageSize=1').then((res) => {
      const id = res.body.managedObjects[0].id as string;
      cy.visitShellAndWaitForSelector(`device/${id}`, 'en', TOGGLE);
      cy.get(TOGGLE).click();
      cy.get(DRAWER).should('be.visible');
    });
  });

  it('toggles caching and persists the state in localStorage', () => {
    openDrawer();

    // default: caching active
    cy.get(ACTIVE_TOGGLE).should('be.checked');
    cy.get(ACTIVE_STATE).should('contain', 'Caching active');

    cy.get(ACTIVE_TOGGLE).click({ force: true });
    cy.get(ACTIVE_STATE).should('contain', 'Caching disabled');
    cy.window().its('localStorage').invoke('getItem', 'c8y-idb-cache-active').should('eq', 'false');

    // survives a reload
    cy.reload();
    cy.get(TOGGLE, { timeout: 60000 }).click();
    cy.get(ACTIVE_TOGGLE).should('not.be.checked');
    cy.get(ACTIVE_STATE).should('contain', 'Caching disabled');

    cy.get(ACTIVE_TOGGLE).click({ force: true });
    cy.get(ACTIVE_STATE).should('contain', 'Caching active');
    cy.window().its('localStorage').invoke('getItem', 'c8y-idb-cache-active').should('eq', 'true');
  });

  it('toggles cancelling requests on navigation and persists it', () => {
    openDrawer();

    // default: disabled
    cy.get(ABORT_TOGGLE).should('not.be.checked');
    cy.get(ABORT_TOGGLE).click({ force: true });
    cy.get(ABORT_TOGGLE).should('be.checked');
    cy.window()
      .its('localStorage')
      .invoke('getItem', 'c8y-idb-abort-on-navigation')
      .should('eq', 'true');

    cy.reload();
    cy.get(TOGGLE, { timeout: 60000 }).click();
    cy.get(ABORT_TOGGLE).should('be.checked').click({ force: true });
    cy.window()
      .its('localStorage')
      .invoke('getItem', 'c8y-idb-abort-on-navigation')
      .should('eq', 'false');
  });

  it('shows cache statistics and clears all caches', () => {
    openDrawer();

    cy.get('[data-cy="index-db-cache--stats-row"]').should('have.length', 3);
    cy.get('[data-cy="index-db-cache--stats"]')
      .should('contain', 'New Series')
      .and('contain', 'Old Series')
      .and('contain', 'Measurements');

    cy.get('[data-cy="index-db-cache--clear-all"]').should('be.enabled').click();
    cy.get('[data-cy="index-db-cache--clear-all"]').should('be.enabled');
    cy.get('[data-cy="index-db-cache--stats-row"]').each(($row) => {
      cy.wrap($row).find('td').last().should('have.text', '0');
    });
  });

  it('shows the empty live log and can clear it', () => {
    openDrawer();

    // the log sits at the bottom of the fixed drawer, partly below the viewport
    cy.get('[data-cy="index-db-cache--log-empty"]')
      .should('exist')
      .and('contain', 'No intercepted requests yet.');
    cy.get('[data-cy="index-db-cache--clear-log"]').click({ force: true });
    cy.get('[data-cy="index-db-cache--log-entry"]').should('not.exist');
    cy.get('[data-cy="index-db-cache--log-empty"]').should('exist');
  });
});
