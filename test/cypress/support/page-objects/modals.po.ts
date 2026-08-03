import { ConfirmModalSelectors } from '../selectors/modals.selectors';

/**
 * Page-object for the Cumulocity confirmation modal (`<c8y-confirm-modal>`).
 */
export class C8yConfirmationModal {
  /**
   * Returns the button inside the confirmation modal identified by `title`.
   */
  static getButton(title: string): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(ConfirmModalSelectors.button(title));
  }

  static ok(): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(ConfirmModalSelectors.OK);
  }

  static cancel(): Cypress.Chainable<JQuery<HTMLElement>> {
    return cy.get(ConfirmModalSelectors.CANCEL);
  }
}
