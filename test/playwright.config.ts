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
  // `<plugin>.spec.ts` and `<plugin>-<area>.spec.ts`, not `<plugin>*`: a package whose name is a prefix of another's
  // (kpi, kpi-widget) must not run the other's specs against its own remotes.
  testMatch: plugin ? [`${plugin}.spec.ts`, `${plugin}-*.spec.ts`] : '*.spec.ts',
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
    // The ui-sdk docs (docs/playwright.md) advise against `trace`: with Playwright 1.65 and the cockpit 1025 build,
    // recording one stalls the shell's page load. On this workspace's Playwright 1.64 and cockpit 1024.21 the suite
    // runs green with it (CI), and a trace of a failed test is what makes a CI failure debuggable (`playwright
    // show-trace`). Re-check this after a Playwright or Web SDK bump: if `page.goto` starts timing out, drop it.
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
