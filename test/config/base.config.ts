import * as dotenv from 'dotenv';

dotenv.config({ path: '../../.env' });

import { defineConfig } from 'cypress';
import installLogsPrinter from 'cypress-terminal-report/src/installLogsPrinter';
import { configureC8yPlugin } from 'cumulocity-cypress/plugin';
import { oauthLogin } from 'cumulocity-cypress';

export function baseConfig(remote?: string, pattern?: string[], packageName?: string) {
  return defineConfig({
    viewportWidth: 1920,
    viewportHeight: 1080,
    responseTimeout: 60000,
    pageLoadTimeout: 300000,

    e2e: {
      baseUrl: process.env.C8Y_CYPRESS_URL || 'http://localhost:9001/',
      async setupNodeEvents(on, config) {
        installLogsPrinter(on, {
          printLogsToConsole: 'always',
        });

        configureC8yPlugin(on, config);
        if (process.env['C8Y_USERNAME']) config.env['C8Y_USERNAME'] = process.env['C8Y_USERNAME'];
        if (process.env['C8Y_PASSWORD']) config.env['C8Y_PASSWORD'] = process.env['C8Y_PASSWORD'];

        const username = config.env['C8Y_USERNAME'] as string | undefined;
        const password = config.env['C8Y_PASSWORD'] as string | undefined;
        const baseUrl = (config.baseUrl ?? config.env['C8Y_BASEURL']) as string | undefined;

        if (username && password && baseUrl) {
          const { token } = await oauthLogin({ user: username, password }, baseUrl);

          config.env['C8Y_TOKEN'] = token;
        }

        return config;
      },
      specPattern: pattern || (packageName ? `cypress/e2e/${packageName}*.cy.ts` : undefined),
      allowCypressEnv: true,
      expose: {
        C8Y_SHELL_EXTENSION: remote || '',
        C8Y_SHELL_TARGET:
          process.env.CYPRESS_C8Y_SHELL_TARGET ||
          process.env.C8Y_SHELL_TARGET ||
          'cockpit-test-1023',
      },
      env: {
        C8Y_TENANT: process.env.CYPRESS_C8Y_TENANT || process.env.C8Y_TENANT,
        C8Y_BASEURL:
          process.env.CYPRESS_C8Y_CYPRESS_URL ||
          process.env.C8Y_CYPRESS_URL ||
          'http://localhost:9001',
        C8Y_SHELL_EXTENSION: remote || '',
        C8Y_SHELL_TARGET:
          process.env.CYPRESS_C8Y_SHELL_TARGET ||
          process.env.C8Y_SHELL_TARGET ||
          'cockpit-test-1023',
        C8Y_USERNAME: process.env.CYPRESS_C8Y_USERNAME || process.env.C8Y_USERNAME,
        C8Y_PASSWORD: process.env.CYPRESS_C8Y_PASSWORD || process.env.C8Y_PASSWORD,
      },
    },
  });
}
