/// <reference types="cypress" />

describe('Reminder', () => {
  before(() => {
    cy.getAuth().login();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector(``, 'en', 'c8y-reminder-indicator');
  });
});
