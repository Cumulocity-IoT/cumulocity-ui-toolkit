/// <reference types="cypress" />

describe('Reminder', () => {
  before(() => {
    Cypress.session.clearAllSavedSessions();

    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
  });
});
