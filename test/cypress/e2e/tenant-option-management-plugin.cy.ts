/// <reference types="cypress" />

const TEST_CATEGORY = 'e2e-test-clank8y-category';
const TEST_OPTIONS = [
  { category: TEST_CATEGORY, key: 'key-alpha', value: 'value-alpha' },
  { category: TEST_CATEGORY, key: 'key-beta', value: 'value-beta' },
];

describe('Tenant Option Management', () => {
  before(() => {
    Cypress.session.clearAllSavedSessions();

    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
  });

  describe('Import all keys of a category', () => {
    before(() => {
      // Create test tenant options used throughout this suite
      cy.getAuth().login();

      for (const option of TEST_OPTIONS) {
        cy.request({
          method: 'POST',
          url: '/tenant/options',
          body: option,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    });

    after(() => {
      // Clean up test tenant options
      cy.getAuth().login();

      for (const option of TEST_OPTIONS) {
        cy.request({
          method: 'DELETE',
          url: `/tenant/options/${option.category}/${option.key}`,
          failOnStatusCode: false,
        });
      }
    });

    beforeEach(() => {
      cy.getAuth().login().disableGainsight();
      cy.visitShellAndWaitForSelector('', 'en', '#navigator');
    });

    it('should show import-all info banner when only a category is entered', () => {
      // Navigate to the Tenant Option Management plugin
      cy.get('#navigator [data-cy="Tenant Option Management"]', { timeout: 60000 })
        .should('exist')
        .should('be.visible')
        .click();

      // Open the "Add existing" modal
      cy.get('[title="Add existing"]', { timeout: 30000 }).should('be.visible').click();

      // Verify modal is open with new title
      cy.get('.modal').within(() => {
        cy.contains('Add Existing Tenant Option').should('be.visible');

        // The info banner should NOT be visible before any input
        cy.get('.alert-info').should('not.exist');

        // Enter a category but leave the key empty
        cy.get('#categoryInput').type(TEST_CATEGORY);

        // The info banner should now appear
        cy.get('.alert-info')
          .should('be.visible')
          .and('contain', `All keys of category "${TEST_CATEGORY}" will be added.`);

        // Close modal
        cy.contains('button', 'Cancel').click();
      });
    });

    it('should hide the info banner when a key is also provided', () => {
      cy.get('#navigator [data-cy="Tenant Option Management"]', { timeout: 60000 })
        .should('exist')
        .should('be.visible')
        .click();

      cy.get('[title="Add existing"]', { timeout: 30000 }).should('be.visible').click();

      cy.get('.modal').within(() => {
        cy.get('#categoryInput').type(TEST_CATEGORY);

        // Info banner is shown
        cy.get('.alert-info').should('be.visible');

        // Now also type a key – banner should disappear
        cy.get('#keyInput').type('key-alpha');

        cy.get('.alert-info').should('not.exist');

        cy.contains('button', 'Cancel').click();
      });
    });

    it('should import all keys of a category and add them to the grid', () => {
      cy.get('#navigator [data-cy="Tenant Option Management"]', { timeout: 60000 })
        .should('exist')
        .should('be.visible')
        .click();

      // Intercept the tenant options list request
      cy.intercept('GET', '/tenant/options*').as('listTenantOptions');

      cy.get('[title="Add existing"]', { timeout: 30000 }).should('be.visible').click();

      cy.get('.modal').within(() => {
        cy.get('#categoryInput').type(TEST_CATEGORY);

        // Info banner confirms "import all" mode
        cy.get('.alert-info').should('be.visible');

        cy.contains('button', 'Import').click();
      });

      // Modal should close after successful import
      cy.get('.modal').should('not.exist');

      // Both test options should now appear in the data grid
      cy.get('c8y-data-grid').within(() => {
        cy.contains(TEST_CATEGORY).should('be.visible');
        cy.contains('key-alpha').should('be.visible');
        cy.contains('key-beta').should('be.visible');
      });
    });
  });
});
