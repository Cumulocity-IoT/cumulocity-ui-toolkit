// Third-party Cypress plugins
import 'cumulocity-cypress/commands';
import installLogsCollector from 'cypress-terminal-report/src/installLogsCollector';
// ui-sdk: cy.visitApp(), cy.resetWorld(), … — importing it also ignores the dashboard grid's
// ResizeObserver loop errors. Page objects and factories are imported in the specs.
import '@cumulocity-iot/ui-sdk/cypress';

import { registerCommands } from './commands';

registerCommands();
installLogsCollector();

afterEach(function (this: Mocha.Context): void {
  if (this.currentTest?.state === 'failed') {
    cy.document().then((doc: Document) => {
      cy.writeFile('cypress/logs/failed-dom.html', doc.documentElement.outerHTML);
    });
  }
});
