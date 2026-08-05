/// <reference types="cypress" />

describe('Smart Views Plugin', () => {
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
  });

  it('Registers the "Smart views" navigator entry', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');

    cy.get('#navigator').contains('Smart views').should('be.visible');
  });
});
