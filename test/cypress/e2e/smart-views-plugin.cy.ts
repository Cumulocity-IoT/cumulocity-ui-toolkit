/// <reference types="cypress" />

describe('Smart Views Plugin', () => {
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
  });

  it('Loads the smart views configuration page', () => {
    // The navigator entry is nested under Settings, so navigate by route instead.
    cy.visitShellAndWaitForSelector('smart-views-configuration', 'en', 'c8y-data-grid');

    cy.get('c8y-title').should('contain.text', 'Smart views configuration');
  });
});
