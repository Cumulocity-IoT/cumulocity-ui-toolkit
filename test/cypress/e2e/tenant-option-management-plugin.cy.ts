/// <reference types="cypress" />

import { mockId } from '../support';

describe('Tenant Option Management', () => {
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('Verify proper setup', () => {
    cy.visitShellAndWaitForSelector('', 'en', '#navigator');
    cy.get('c8y-navigator-node button[data-cy="Settings"]').click();
    cy.get('c8y-navigator-node button[data-cy="Options"]')
  });

  describe('Import Tenant Option dialog', () => {
    // Fully intercept-based — no request in these tests is allowed to reach
    // the real tenant. See individual intercepts below for every endpoint
    // exercised by the "Add existing" flow.
    const CONFIG_ID = mockId();

    /**
     * Registers the intercepts every visit of the plugin route needs
     * (fired from `TenantOptionManagementComponent.reload()` on init):
     *  - GET inventory/managedObjects?...type=tenant_option_plugin_config...  (getConfiguration)
     *  - GET tenant/options?pageSize=2000&withTotalPages=true                (getAllOptions)
     */
    function interceptInitialLoad(configOptions: { category: string; key: string }[]) {
      cy.intercept(
        'GET',
        '**/inventory/managedObjects?*type=tenant_option_plugin_config*',
        (req) => {
          req.reply({
            statusCode: 200,
            body: {
              managedObjects: [
                {
                  id: CONFIG_ID,
                  type: 'tenant_option_plugin_config',
                  options: configOptions,
                  self: '',
                },
              ],
              statistics: { totalPages: 1, pageSize: 1, currentPage: 1 },
            },
          });
        }
      ).as('getConfig');

      cy.intercept('GET', '**/tenant/options?*', (req) => {
        // Bare list (no `category` filter) — used by getAllOptions(). Any
        // category-scoped call is handled by a more specific intercept
        // registered later in the test, which Cypress matches first.
        req.reply({
          statusCode: 200,
          body: { options: [], statistics: { totalPages: 1, pageSize: 2000, currentPage: 1 } },
        });
      }).as('getAllOptions');
    }

    it('imports every tenant option of a category when Key is left empty, skipping ones already registered', () => {
      const category = 'e2e.bulk.import.category';
      const existingKey = 'existing.option';
      const newKey = 'new.option';

      interceptInitialLoad([
        { category, key: existingKey },
      ]);
      // Deliberately NOT intercepting `/user/currentUser` — the shell itself
      // depends on that response for chrome (language, avatar, translations).
      // Overriding it broke unrelated shell rendering; getUser() is left to
      // hit the real (already-authenticated) backend, a harmless read.

      // Category-scoped list — triggered by clicking "Import" with Key empty.
      // Registered after the generic '**/tenant/options?*' intercept above so
      // Cypress matches this one first for requests that carry `category=`.
      cy.intercept('GET', `**/tenant/options?*category=${encodeURIComponent(category)}*`, {
        statusCode: 200,
        body: {
          options: [
            { category, key: existingKey, value: 'existing-value' },
            { category, key: newKey, value: 'new-value' },
          ],
          statistics: { totalPages: 1, pageSize: 2000, currentPage: 1 },
        },
      }).as('getOptionsByCategory');

      cy.intercept('PUT', `**/inventory/managedObjects/${CONFIG_ID}`, (req) => {
        req.reply({ statusCode: 200, body: req.body });
      }).as('updateConfig');

      cy.visitShellAndWaitForSelector('', 'en', '#navigator');
      cy.get('c8y-navigator-node button[data-cy="Settings"]').click();
      cy.get('c8y-navigator-node button[data-cy="Options"]').click();
      cy.get('button[title="Add existing"]').should('be.visible');

      cy.wait('@getConfig');
      cy.wait('@getAllOptions');

      cy.get('button[title="Add existing"]').click();

      cy.get('#categoryInput').should('be.visible').type(category);
      cy.get('#keyInput').should('have.value', '');

      cy.get('button[title="Import"]').click();

      cy.wait('@getOptionsByCategory')
        .its('request.url')
        .should('include', `category=${encodeURIComponent(category)}`);

      // Second getConfiguration() call, made inside allowListOptionsByCategory().
      cy.wait('@getConfig');

      cy.wait('@updateConfig')
        .its('request.body.options')
        .should((options: { category: string; key: string }[]) => {
          expect(options).to.have.length(2);
          expect(options.filter((o) => o.key === existingKey)).to.have.length(1);
          expect(options.filter((o) => o.key === newKey)).to.have.length(1);
        });

      // Modal closed itself after a successful import.
      cy.get('#categoryInput').should('not.exist');

      // No failure alert — already-registered options must not abort the batch.
      cy.get('[data-cy="c8y-alert--message"].alert-danger').should('not.exist');

      // The newly imported option is merged into the grid...
      cy.get('td[data-cy="data-grid--Key"]').should('contain', newKey);
      // ...and the pre-existing one is still there exactly once (no duplicate row).
      cy.get('td[data-cy="data-grid--Key"]').filter(`:contains(${existingKey})`).should('have.length', 1);
    });

    it('imports only the specified tenant option when both Category and Key are provided', () => {
      const category = 'e2e.single.import.category';
      const key = 'single.option';

      interceptInitialLoad([]);

      cy.intercept('GET', `**/tenant/options/${encodeURIComponent(category)}/${encodeURIComponent(key)}`, {
        statusCode: 200,
        body: { category, key, value: 'single-value', self: '' },
      }).as('getOptionDetail');

      cy.intercept('PUT', `**/inventory/managedObjects/${CONFIG_ID}`, (req) => {
        req.reply({ statusCode: 200, body: req.body });
      }).as('updateConfig');

      cy.visitShellAndWaitForSelector('', 'en', '#navigator');
      cy.get('c8y-navigator-node button[data-cy="Settings"]').click();
      cy.get('c8y-navigator-node button[data-cy="Options"]').click();
      cy.get('button[title="Add existing"]').should('be.visible');

      cy.wait('@getConfig');
      cy.wait('@getAllOptions');

      cy.get('button[title="Add existing"]').click();

      cy.get('#categoryInput').should('be.visible').type(category);
      cy.get('#keyInput').type(key);

      cy.get('button[title="Import"]').click();

      cy.wait('@getOptionDetail');
      cy.wait('@getConfig');

      cy.wait('@updateConfig')
        .its('request.body.options')
        .should((options: { category: string; key: string }[]) => {
          expect(options).to.have.length(1);
          expect(options[0]).to.include({ category, key });
        });

      cy.get('#categoryInput').should('not.exist');
      cy.get('td[data-cy="data-grid--Key"]').should('contain', key);
    });
  });
});
