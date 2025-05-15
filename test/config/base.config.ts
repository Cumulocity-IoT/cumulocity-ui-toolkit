import { defineConfig } from 'cypress';
import installLogsPrinter from 'cypress-terminal-report/src/installLogsPrinter';

export function baseConfig(remote?: string, pattern?: string[]) {
  return defineConfig({
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
      specPattern: pattern,
      env: {
        C8Y_TENANT: 't2086305002',
        C8Y_BASEURL: 'http://localhost:9001/',
        C8Y_SHELL_EXTENSION: remote ?? '',
        C8Y_SHELL_TARGET: 'cockpit-test',
        C8Y_USERNAME: 'cypress',
        C8Y_PASSWORD: '*********',
      },
    },
  });
}
