/// <reference types="cypress" />

describe('Reminder', () => {
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', 'c8y-reminder-indicator');
  });
});
