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

    cy.get('button[aria-controls="collapseCache"]').should('be.visible').click();

    cy.get('#collapseCache').should('be.visible');
  });
});
