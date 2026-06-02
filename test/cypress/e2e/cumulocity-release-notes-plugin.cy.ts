/// <reference types="cypress" />

describe('Release notes', () => {
  before(() => {
    Cypress.session.clearAllSavedSessions();
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => { 
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
    cy.get('c8y-navigator-node button[data-cy="Settings"]').click();
    cy.get('c8y-navigator-node button[data-cy="Release Notes"]')
  });
});
