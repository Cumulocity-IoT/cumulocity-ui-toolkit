// Third-party Cypress plugins
import 'cumulocity-cypress/lib/commands';
import installLogsCollector from 'cypress-terminal-report/src/installLogsCollector';

// Custom commands and support library
import { registerCommands } from './commands';
import { clearAllManagedObjectsOfTest } from './api';
import { testIdRegistry } from './utils/test-id-registry';

registerCommands();
installLogsCollector();

/**
 * Global teardown — clean up all registered test IDs after each spec.
 * Each per-plugin config sets a narrow `specPattern` so only relevant
 * test IDs are accumulated per run.
 */
after(() => {
  const ids = testIdRegistry.getAll();
  if (ids.size === 0) return;
  cy.getAuth().login();
  ids.forEach((id) => clearAllManagedObjectsOfTest(id));
});

// ---------------------------------------------------------------------------
// Global error handlers
// ---------------------------------------------------------------------------

/**
 * Suppress the ResizeObserver loop-limit error that Angular's CDK emits when
 * rendering widgets into the Cumulocity dashboard grid.  This is a known
 * browser quirk and does not affect test reliability.
 */
Cypress.on('uncaught:exception', (err) => {
  if (err.message.includes('ResizeObserver')) {
    return false;
  }
});

afterEach(function (this: Mocha.Context): void {
  if (this.currentTest?.state === 'failed') {
    cy.document().then((doc: Document) => {
      cy.writeFile('cypress/logs/failed-dom.html', doc.documentElement.outerHTML);
    });
  }
});
