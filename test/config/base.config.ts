// in test/config/base.config.ts
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

import { defineConfig } from 'cypress';
import installLogsPrinter from 'cypress-terminal-report/src/installLogsPrinter';

export function baseConfig(remote?: string, pattern?: string[], packageName?: string) {
  return defineConfig({
    viewportWidth: 1920,
    viewportHeight: 1080,
    responseTimeout: 60000,
    pageLoadTimeout: 300000,

    e2e: {
      baseUrl: process.env.C8Y_CYPRESS_URL || 'http://localhost:9001/',
      setupNodeEvents(on) {
        installLogsPrinter(on, {
          printLogsToConsole: 'always',
        });
      },
      specPattern: pattern || (packageName ? `cypress/e2e/${packageName}*.cy.ts` : undefined),
      env: {
        C8Y_TENANT: process.env.CYPRESS_C8Y_TENANT || process.env.C8Y_TENANT,
        C8Y_BASEURL:
          process.env.CYPRESS_C8Y_CYPRESS_URL ||
          process.env.C8Y_CYPRESS_URL ||
          'http://localhost:9001',
        C8Y_SHELL_EXTENSION: remote || '',
        C8Y_SHELL_TARGET:
          process.env.CYPRESS_C8Y_SHELL_TARGET || process.env.C8Y_SHELL_TARGET || 'cockpit',
        C8Y_USERNAME: process.env.CYPRESS_C8Y_USERNAME || process.env.C8Y_USERNAME,
        C8Y_PASSWORD: process.env.CYPRESS_C8Y_PASSWORD || process.env.C8Y_PASSWORD,
      },
    },
  });
}
