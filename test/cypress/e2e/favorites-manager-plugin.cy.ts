/// <reference types="cypress" />

/**
 * Favorites Manager e2e — runs against the tenant mock (windy-dev world).
 *
 * Features:
 *  - navigator node "Favorites" → /favorites route with a data grid of favorites
 *  - empty state when the current user has no favorites
 *  - action-bar button on device / group / asset context to add / remove a favorite
 *    (persisted in `customProperties.favorites` of the current user via PUT /user/currentUser)
 *  - error alerts when persisting fails
 */

const ACTION_BUTTON = '[data-cy="favorites-action-button"]';
const NAV_NODE = 'c8y-navigator-node button[data-cy="favorites.title"]';

interface MO {
  id: string;
  name: string;
}

/** Overrides the favorites of the current user in GET /user/currentUser responses. */
function interceptCurrentUser(favorites?: string[]): void {
  cy.intercept('GET', '**/user/currentUser*', (req) => {
    req.continue((res) => {
      if (favorites !== undefined && res.body) {
        res.body.customProperties = { ...(res.body.customProperties || {}), favorites };
      }
    });
  }).as('getCurrentUser');
}

function firstOf(fragment: string): Cypress.Chainable<MO> {
  return cy
    .request(`/inventory/managedObjects?fragmentType=${fragment}&pageSize=1`)
    .then((res) => res.body.managedObjects[0] as MO);
}

describe('Favorites Manager', () => {
  let device: MO;
  let group: MO;

  before(() => {
    cy.request('POST', '/_mock/reset');
    cy.getAuth().login();
    firstOf('c8y_IsDevice').then((mo) => (device = mo));
    firstOf('c8y_IsDeviceGroup').then((mo) => (group = mo));
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('opens the favorites list from the navigator and shows the empty state', () => {
    interceptCurrentUser([]);
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');

    cy.get(NAV_NODE, { timeout: 60000 }).should('be.visible').contains('Favorites').click();

    cy.location('hash').should('contain', '/favorites');
    cy.get('c8y-favorites-manager').should('be.visible');
    cy.get('[data-cy="favorites-empty-state"]')
      .should('be.visible')
      .and('contain', 'No favorites to display.');
  });

  it('lists the favorites of the current user in the grid', () => {
    interceptCurrentUser([device.id, group.id]);
    cy.intercept('GET', '**/inventory/managedObjects?query=*id%20eq*withParents=true*').as('getFavorites');

    cy.visitShellAndWaitForSelector('favorites', 'en', 'c8y-favorites-manager');

    cy.wait('@getFavorites').its('request.url').then(decodeURIComponent).should('include', device.id).and('include', group.id);
    cy.get('td[data-cy="data-grid--Name"]').should('have.length', 2);
    cy.get('td[data-cy="data-grid--Name"]').should('contain', device.name).and('contain', group.name);
    cy.get('[data-cy="favorites-empty-state"]').should('not.exist');
  });

  it('adds a device to favorites from the action bar and removes it again', () => {
    interceptCurrentUser([]);
    cy.intercept('PUT', '**/user/currentUser*').as('updateCurrentUser');

    cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', ACTION_BUTTON, 60000);
    cy.get(ACTION_BUTTON).should('contain', 'Add to favorites').find('i.dlt-c8y-icon-star-outline');

    cy.get(ACTION_BUTTON).click();
    cy.wait('@updateCurrentUser')
      .its('request.body.customProperties.favorites')
      .should('deep.equal', [device.id]);
    cy.get(ACTION_BUTTON).should('contain', 'Remove from favorites').find('i.dlt-c8y-icon-star');

    // the next GET returns the persisted state (favorite set) – stop overriding it
    interceptCurrentUser(undefined);
    cy.get(ACTION_BUTTON).click();
    cy.wait('@updateCurrentUser')
      .its('request.body.customProperties.favorites')
      .should('deep.equal', []);
    cy.get(ACTION_BUTTON).should('contain', 'Add to favorites');
  });

  it('shows the favorite state of an already favorited group', () => {
    interceptCurrentUser([group.id]);

    cy.visitShellAndWaitForSelector(`group/${group.id}`, 'en', ACTION_BUTTON, 60000);
    cy.get(ACTION_BUTTON).should('contain', 'Remove from favorites').find('i.dlt-c8y-icon-star');
  });

  it('shows an error alert and keeps the state when saving fails', () => {
    interceptCurrentUser([]);
    cy.intercept('PUT', '**/user/currentUser*', { statusCode: 500, body: {} }).as('updateFail');

    cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', ACTION_BUTTON, 60000);
    cy.get(ACTION_BUTTON).click();
    cy.wait('@updateFail');

    cy.get('c8y-alert-outlet .alert-danger')
      .should('be.visible')
      .and('contain', 'Could not add this item to your favorites.');
    cy.get(ACTION_BUTTON).should('contain', 'Add to favorites');
  });

  // Not covered: the "Could not load your favorites." path. Failing GET /user/currentUser
  // also breaks the cockpit shell bootstrap, so the action bar never renders on the mock.
});
