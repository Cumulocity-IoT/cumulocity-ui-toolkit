/// <reference types="cypress" />

describe('Tenant Option Management', () => {
  before(() => {
    Cypress.session.clearAllSavedSessions();

    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
  });
});
