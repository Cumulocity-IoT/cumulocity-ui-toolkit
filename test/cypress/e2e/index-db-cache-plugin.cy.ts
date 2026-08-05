/// <reference types="cypress" />

describe('Index DB Cache Plugin', () => {
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
  });

  it('Shows the cache action bar button and opens the drawer', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');

    // the drawer is rendered but collapsed until the action bar button is clicked
    cy.get('#collapseCache').should('not.be.visible');

    cy.get('[data-cy="index-db-cache--toggle"]').should('be.visible').click();

    cy.get('#collapseCache').should('be.visible');
    cy.get('[data-cy="index-db-cache--close"]').should('be.visible');
  });
});
