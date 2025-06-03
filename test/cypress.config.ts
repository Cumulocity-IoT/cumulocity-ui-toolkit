import { defineConfig } from 'cypress';
import installLogsPrinter from 'cypress-terminal-report/src/installLogsPrinter';

export default defineConfig({
  viewportWidth: 1920,
  viewportHeight: 1080,
  responseTimeout: 60000,
  pageLoadTimeout: 300000,
  e2e: {
    baseUrl: 'http://localhost:9001/',
    setupNodeEvents(on) {
      installLogsPrinter(on, {
        printLogsToConsole: 'always',
      });
    },
    specPattern: ['cypress/e2e/**/*.cy.ts'],
    env: {
      C8Y_TENANT: 't2086305002',
      C8Y_BASEURL: 'http://localhost:9001/',
      C8Y_SHELL_EXTENSION: `{"cumulocity-layered-map-widget":["LayeredMapWidgetModule"]}`,
      C8Y_SHELL_TARGET: 'cockpit-test',
      C8Y_USERNAME: 'cypress',
      C8Y_PASSWORD: '************',
    },
  },
});
