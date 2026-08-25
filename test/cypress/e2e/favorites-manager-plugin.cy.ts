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

  it('should render the "search-in-list" icon for the Favorites navigator entry (#81)', () => {
    // open the Cockpit application extended with the Favorites Manager module locally
    // and wait for the navigator menu to be visible
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');

    // the navigator icon lives as a sibling of the entry's button, inside the shared
    // .link wrapper rendered by c8y-navigator-node - assert it uses the fixed icon
    // (previously 'mark-as-favorite', now 'search-in-list' per issue #81)
    cy.get('c8y-navigator-node button[data-cy="favorites.title"]', { timeout: 60000 })
      .should('exist')
      .parents('.link')
      .find('c8y-navigator-icon i')
      .should('have.class', 'dlt-c8y-icon-search-in-list')
      .and('not.have.class', 'dlt-c8y-icon-mark-as-favorite');
  });
});
