/// <reference types="cypress" />

describe('Release notes', () => {
  before(() => {
    cy.getAuth().login();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', 'c8y-navigator-node button[data-cy="Settings"]');
    cy.get('c8y-navigator-node button[data-cy="Settings"]').should('be.visible').click();
    cy.get('c8y-navigator-node button[data-cy="Release Notes"]').should('be.visible').click();
    cy.get('c8y-action-bar .navbar-right li').should('contain.text', 'Create Release Note');
  });
});
