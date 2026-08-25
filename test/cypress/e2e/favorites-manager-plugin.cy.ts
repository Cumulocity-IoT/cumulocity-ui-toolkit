describe('Favorites Manager', () => {
  // login with the new user before each test and mock the device inventory
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  // delete the user after the test suite runs
  after(() => {
    cy.getAuth().login();
  });

  it('should load favorites list when clicking on favorites menu item', () => {
    // open the Cockpit application extended with the Favorites Manager module locally
    // and wait for the navigator menu to be visible
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');

    // check for the favorites menu item and click on it
    cy.get('c8y-navigator-node button[data-cy="favorites.title"]', { timeout: 60000 })
      .should('exist')
      .should('be.visible')
      .contains('Favorites')
      .click();

    // expect the favorites list component to be visible
    cy.get('c8y-favorites-manager').should('exist').should('be.visible');
  });
});
