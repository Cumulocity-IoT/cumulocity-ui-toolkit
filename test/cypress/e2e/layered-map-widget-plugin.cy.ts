/// <reference types="cypress" />

describe('Layered Map Widget', () => {
  before(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
  });
});
