/// <reference types="cypress" />

describe('Release notes', () => {
  before(() => {
    Cypress.session.clearAllSavedSessions();

    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
  });
});
