/// <reference types="cypress" />

describe('Tenant Option Management', () => {
  before(() => {
    Cypress.session.clearAllSavedSessions();
  });
  
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', 'c8y-navigator-node button[data-cy="Options"]');
  });
});
