/// <reference types="cypress" />

describe('Advanced Radial Gauge Plugin', () => {
  before(() => {
    Cypress.session.clearAllSavedSessions();

    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
  });
});
