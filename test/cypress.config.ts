import dotenv from 'dotenv';

dotenv.config({ path: '../.env' }); // adjust path as needed

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
      C8Y_TENANT: process.env.C8Y_TENANT,
      C8Y_BASEURL: 'http://localhost:9001',
      C8Y_SHELL_EXTENSION: `{"sag-ps-iot-pkg-favorites-manager-plugin": ["favoritesManagerViewProviders"]}`,
      C8Y_SHELL_TARGET: process.env.C8Y_SHELL_TARGET,
      C8Y_USERNAME: process.env.C8Y_USERNAME,
      C8Y_PASSWORD: process.env.C8Y_PASSWORD,
    },
  },
});
