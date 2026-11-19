import { defineConfig } from '@playwright/test';

// Playwright suite on the tenant mock: `node scripts/e2e-mock.mts <plugin> --runner=playwright` starts the mock and
// the plugin's dev server and passes E2E_PLUGIN, C8Y_BASEURL and the mock's login in the environment.
// The plugin's `?remotes=` value comes from its cumulocity.config.ts, as in the Cypress configs.
const plugin = process.env.E2E_PLUGIN;

if (plugin && !process.env.C8Y_REMOTES) {
  type PluginConfig = { default: { runTime: { remotes: Record<string, string[]> } } };
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const config = (require(`../packages/${plugin}/cumulocity.config`) as PluginConfig).default;

  process.env.C8Y_REMOTES = JSON.stringify(config.runTime.remotes);
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
  reporter: [['list']],
  outputDir: 'playwright-results',
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
