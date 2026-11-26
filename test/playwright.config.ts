import { defineConfig } from '@playwright/test';
import { pluginRemotes } from './playwright/support/remotes';

// Playwright suite on the tenant mock: `pnpm run e2e:mock <plugin>` (scripts/e2e-mock.mts) starts the mock and the
// plugin's dev server and passes E2E_PLUGIN, C8Y_BASEURL and the mock's login in the environment. The plugin's
// `?remotes=` value comes from its cumulocity.config.ts.
const plugin = process.env.E2E_PLUGIN;

if (plugin && !process.env.C8Y_REMOTES) {
  process.env.C8Y_REMOTES = JSON.stringify(pluginRemotes(plugin));
}

export default defineConfig({
  testDir: './playwright',
  testMatch: plugin ? `${plugin}*.spec.ts` : '*.spec.ts',
  // One mock, shared state: tests that write to it must not run side by side.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI
    ? [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]]
    : [['list']],
  // Per plugin: Playwright wipes the output folder at start, so two plugins' runs do not delete each other's traces.
  outputDir: plugin ? `playwright-results/${plugin}` : 'playwright-results',
  use: {
    baseURL: process.env.C8Y_BASEURL ?? 'http://localhost:9001',
    viewport: { width: 1920, height: 1080 },
    timezoneId: 'Etc/UTC',
    navigationTimeout: 300_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
