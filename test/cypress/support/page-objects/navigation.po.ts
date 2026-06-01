import { recurse } from 'cypress-recurse';
import { NavigatorSelectors, TabMenuSelectors } from '../selectors/navigation.selectors';

/**
 * Page-object for the Cumulocity shell side navigator.
 */
export class C8ySideMenu {
  /** Toggles the left-side navigator open/closed. */
  toggleMenu(): void {
    cy.get('.navigator-toggle').click();
  }

  /** Clicks a top-level navigator node identified by its `data-cy` attribute. */
  clickMainNode(title: string): void {
    cy.get(NavigatorSelectors.settingsNode(title), { timeout: 60_000 })
      .should('be.visible')
      .click();
  }

  /** Clicks a sub-node inside the navigator identified by its `data-cy` attribute. */
  clickSubNode(title: string): void {
    cy.get(NavigatorSelectors.node(title), { timeout: 60_000 })
      .should('be.visible')
      .click();
  }
}

/**
 * Page-object for the tab-strip at the top of a device/group detail view.
 */
export class C8yTabMenu {
  static getButton(title: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(TabMenuSelectors.tab(title));
  }

  static getAddDashboardButton(): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(TabMenuSelectors.ADD_DASHBOARD);
  }
}

// ---------------------------------------------------------------------------
// Navigation helpers
// ---------------------------------------------------------------------------

/**
 * Navigates to the application, opens the navigator, then optionally clicks a
 * Settings sub-item identified by `item` (`data-cy` attribute).
 *
 * Uses `cypress-recurse` to retry opening the navigator until it reports the
 * `open` class, making the helper resilient to timing issues.
 */
export function visitAndWaitForSettingsLoaded(item?: string): void {
  cy.visitShellAndWaitForSelector('', 'en', '.navigator-toggle');

  recurse(
    () => {
      cy.get('.navigator-toggle').click();
      return cy.get('nav#navigator');
    },
    (nav) => expect(nav.hasClass('open'))
  );

  cy.get('c8y-navigator-node button[data-cy="Settings"]', { timeout: 60_000 })
    .should('be.visible')
    .click();

  if (item) {
    cy.get(`c8y-navigator-node button[data-cy="${item}"]`).click();
  }
}
