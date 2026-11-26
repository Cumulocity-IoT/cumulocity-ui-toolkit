# AGENTS.md — Playwright E2E Test Suite

Guidance for AI agents working in the `test/` directory.

---

## Overview

End-to-end tests for the UI Toolkit plugins. Every plugin in `packages/` has one or more spec files here. Tests run
against the **tenant mock** of [`@cumulocity-iot/ui-sdk`](https://github.com/Cumulocity-IoT/c8y-ai-ui-sdk): an emulated
tenant serving the windy-dev world and the real cockpit release build, with the plugin served by the Angular dev
server (`ng serve -u <mock>`). No real tenant, no credentials, no cleanup.

**Tech stack:** Playwright 1.64 · `@cumulocity-iot/ui-sdk` 4.0 (mock, fixtures, factories, generated selectors, component drivers, review tools) · TypeScript 5.9 · pnpm

---

## Layout

```
test/
├── package.json                  # Member of the root pnpm workspace (root `pnpm install` covers it)
├── tsconfig.json                 # Specs, config and scripts (es2022, bundler resolution)
├── playwright.config.ts          # One config: E2E_PLUGIN picks `<plugin>*.spec.ts` and the plugin's remotes
├── c8y-ui.json                   # Mock config: shell, world file, ports, auth mode, shell checksums
├── mock/windy-dev.json           # The world (git-ignored, pulled at runtime)
├── scripts/
│   ├── e2e-mock.mts              # Starts the mock and the dev server, runs Playwright, collects screenshots and gaps
│   └── pull-world.mts            # Pulls the world from windy-dev (go-c8y-cli)
└── playwright/
    ├── selectors.ts              # Generated: the data-cy selectors of the installed Web SDK (pnpm run e2e:selectors)
    ├── <plugin>[-<area>].spec.ts # One or more specs per plugin (navigation-and-search-tree.spec.ts, …)
    └── support/
        ├── fixtures.ts           # `test` / `expect` for the specs: the ui-sdk fixtures, visitApp settling a frozen clock; settleClock
        ├── remotes.ts            # `?remotes=` value from a plugin's cumulocity.config.ts
        ├── dashboard.ts          # shell(page): the ui-sdk's drivers (dashboard, widgetConfig, dataGrid, confirmModal, alerts) on selectors.ts
        ├── navigation-and-search.ts # That plugin's data-cy hooks and steps (drawer, rows, settings drawer), shared by its six specs
        └── availability.ts       # makeUnavailable / restoreWorld (unavailable devices on the mock)
```

Run output (git-ignored): `playwright-results/` (trace and screenshot per failed test), `playwright-report/` (HTML
report, CI only), `review-screenshots/<plugin>/` (the views the specs photograph with `reviewScreenshot`).

---

## Prerequisites

```bash
pnpm install              # root: the plugins, their dev server and this workspace
pnpm run e2e:install      # once per machine: Playwright's Chromium build (CI: --with-deps)
```

Installing needs read access to GitHub Packages for `@cumulocity-iot` (root `AGENTS.md` → MCP Servers for the
`~/.npmrc` setup).

---

## Running Tests

`scripts/e2e-mock.mts` starts the mock with the **windy-dev world** and the **cockpit release build of the Web SDK
version the workspace is on** (root `package.json` → `@c8y/ngx-components`), serves the plugin against it and runs
the plugin's specs. After a Web SDK bump it downloads the new cockpit on the next run and records its checksum in
`c8y-ui.json` → commit that.

| Purpose | Root command |
|---|---|
| Run one plugin's suite | `pnpm run e2e:mock <name>` |
| Playwright UI mode | `pnpm run e2e:mock <name> --open` |
| Watch the browser, run some tests | `pnpm run e2e:mock <name> --headed --spec=<filter>` (`--spec` is Playwright's file filter, a regex for several files: `"--spec=navigation-and-search-(tree|search)"`; test titles go through `-g "<title regex>"`) |
| Pass more to `playwright test` | `pnpm run e2e:mock <name> --repeat-each=3` (arguments the script does not know go through; more filters the same way) |
| Re-pull the world from windy-dev | `pnpm run e2e:world:pull` (`e2e:mock` does it when the file is missing) |
| Another cockpit release | `E2E_SHELL_VERSION=1024.22.1 pnpm run e2e:mock <name>` (what `shell-compat.yml` does daily; `E2E_MOCK_GAPS=<file>` lists the requests the mock does not emulate). Rewrites `c8y-ui.json` → `version` and adds checksums; do not commit that |
| Parallel runs, taken ports | `E2E_MOCK_PORT=8211 E2E_DEV_PORT=9101 pnpm run e2e:mock <name>` (defaults 8111 / 9001 from `c8y-ui.json`) |
| Review screenshots, reproducible | `pnpm run e2e:mock <name> --frozen`: the mock's clock stays at the world's `now`, the browser's `Date` a minute after it, so two runs render the same to the pixel. The specs' `reviewScreenshot` files land in `review-screenshots/<name>/` (a full run replaces the folder, `--spec` adds to it) |
| Compare two sets of screenshots | `pnpm exec c8y-ui review screenshots <base folder> test/review-screenshots --ignore 120 --out <report folder>` (what `e2e-test.yml` does against `main`; two frozen runs of the same code still differ by up to about 100 px of glyph antialiasing, a changed word is more) |
| Validate the world | `pnpm -C test exec c8y-ui world check` (the mock refuses data a tenant refuses; CI runs it after the pull) |
| Regenerate the Web SDK selectors | `pnpm run e2e:selectors` after a Web SDK bump, then `pnpm -C test exec tsc -p tsconfig.json`: a spec that used a removed selector fails to compile. `pnpm -C test exec c8y-ui migrate report --to <version>` lists those lines before the bump. CI fails when the file is stale |
| Open a failure's trace | `pnpm -C test exec playwright show-trace test/playwright-results/<test>/trace.zip` |

- `c8y-ui.json` — mock config: version (synced automatically), shell `cockpit`, world, ports, `auth: login` (the
  fixtures log in with the world's user; any password is accepted), shell checksums.
- The world is windy-dev's energy site "Cuxhaven" (`WORLD_ROOT` overrides the root id): devices, 7 days of
  measurements and alarms, the newest 50 events per source. It is pulled through go-c8y-cli: locally with your
  session (`C8Y_SESSION=~/.cumulocity/windy-dev…json`), in CI with `C8Y_HOST` / `C8Y_USER` / `C8Y_PASSWORD` from
  the `e2e` environment (`WINDY_C8Y_*`). Writes from tests stay in the mock until `mock.reset()`.
- Microservices, smart rules and Notifications 2.0 are not emulated — see the ui-sdk's `docs/mock.md` for what the
  mock answers, and `docs/playwright.md` for the fixtures and a Cypress-to-Playwright mapping.
- CI: `e2e-test.yml` runs the suites of the plugins a PR changes; `shell-compat.yml` runs every plugin that has a
  spec (`playwright/<plugin>*.spec.ts`) inside the latest cockpit release.

---

## Config

`playwright.config.ts` is the only config. `e2e-mock.mts` sets the environment the fixtures read:

| Variable | Meaning |
|---|---|
| `E2E_PLUGIN` | The package folder: `testMatch` becomes `<plugin>*.spec.ts`, `C8Y_REMOTES` is derived from its `cumulocity.config.ts` (`support/remotes.ts`) |
| `C8Y_BASEURL` | The dev server (proxies everything it does not build to the mock, `/_mock/*` included) |
| `C8Y_SHELL` | `cockpit` |
| `C8Y_REMOTES` | The `?remotes=` value: `runTime.remotes` of the plugin, or `{ <name-derived context path>: exports }` for plugins without `contextPath` |
| `C8Y_TENANT`, `C8Y_USERNAME`, `C8Y_PASSWORD` | The world's tenant and user; the fixtures log in with them |
| `C8Y_MOCK_URL` | Where `api` and `mock` send their requests (the mock itself, not the dev server's proxy, which reset connections now and then); each test reports its name there, so the gap report lists the tests behind each gap |
| `C8Y_SCREENSHOTS_DIR` | Where `reviewScreenshot` writes: a temporary folder while the run lasts (the dev server watches the project), copied to `review-screenshots/<plugin>/` afterwards |
| `C8Y_FROZEN_NOW` | Set by `--frozen` to the world's `now`: `visitApp` holds the page's `Date` a minute after it |

Settings: one worker (one mock, shared state), 180 s per test, 15 s expect timeout, 1920×1080, UTC, trace and
screenshot kept on failure, one retry in CI.

---

## Fixtures and Support Library

### `@cumulocity-iot/ui-sdk/playwright`

```ts
import { expect, test } from '@cumulocity-iot/ui-sdk/playwright';
```

| Fixture | Purpose |
|---|---|
| `visitApp(path, { language, waitFor, timeout, modules, remotes, shell })` | Open `path` in the shell with the plugin's remotes, set the UI language (localStorage `c8y_language` and the stored preference), wait until `waitFor` is visible |
| `mock.reset()` | The world as loaded, request log cleared — call it in `beforeEach` |
| `mock.loadWorld(world)` | Replace the world (a world file's content) |
| `mock.requests(since?)` | What the app sent to the mock |
| `api` | `APIRequestContext` on the mock as the world's user: arrange state (`api.post('/inventory/managedObjects', { data })`), read it back. The app's own files (`/apps/<contextPath>/…`) are the dev server's: `page.request` for those. A body from a factory goes through `writable()` (`@cumulocity-iot/ui-sdk/factories`): the mock refuses `id` and `lastUpdated` on a write |
| `reviewScreenshot(name, { fullPage?, mask?, settle? })` | A screenshot of the view for the reviewer of a change, taken once the view stops changing (two equal pictures 500 ms apart, at most `settle` 10 s), as `review-screenshots/<plugin>/<name>.png`. Name it `<plugin>/<view>`. CI takes them on the change and on `main` and lists the views that differ; nothing is committed |
| `advanceClock(ms)` | In a frozen run, moves the page's `Date` by `ms` (`debounceTime` compares two `Date.now()` readings, so it never fires while `Date` stands still). Specs use `settleClock(page)` from `support/fixtures.ts` instead: it moves the clock eight times with real time in between, so a chain of debounces fires |
| automatic | The page is logged in; the test name is reported to the mock |

`mock` and `api` are worker-scoped: `beforeAll` can reset the mock and read ids from the world.

### `@cumulocity-iot/ui-sdk/factories` — platform-shaped data

`createManagedObject`, `mockDevice`, `mockGroup`, `mockDashboard(target, widgets)`, `mockWidget`,
`getWidgetConfigs`, `mockListResponse(items, { key, statistics })`, `mockChildAssetsResponse`, `mockEvent`,
`mockMeasurement`, `mockMeasurementsResponse`, `mockTenantOptionResponse`, `mockId` — bodies for `page.route`
stubs and objects to `api.post` onto the mock.

### `playwright/support/` (this repo)

Specs import `test` and `expect` from `./support/fixtures`, not from the ui-sdk: the same fixtures, with `visitApp`
followed by `settleClock(page)`. The cockpit shell waits on `Date` at startup (`HeaderService.verifyIfNavOpen`
opens the navigator through `debounceTime(300)`), so a frozen page would stay without a navigator.

| Helper | Purpose |
|---|---|
| `settleClock(page)` (`fixtures.ts`) | In a frozen run: eight times `Date` + 1 s and 300 ms of real time, so every debounce the app armed fires. Call it after an in-app action that arms one (a navigation click, typing into a search or filter field). A no-op in a normal run |
| `pluginRemotes(plugin)` (`remotes.ts`) | The `?remotes=` value from a plugin's `cumulocity.config.ts`; used by the config |
| `makeUnavailable(api, mock, ...ids)` / `restoreWorld(mock)` (`availability.ts`) | Makes devices unavailable the way a tenant does: loads the world again with their last message hours back (the mock derives `c8y_Availability`; a PUT of it does not stick). Call `restoreWorld` in `afterEach` |
| `shell(page)`, `DASHBOARD_READY` (`dashboard.ts`) | `shell(page)` is `drivers(page, selectors)` of the ui-sdk: `dashboard` (`edit()`, `addWidget(name)`, `editWidget(title \| n)`, `removeWidget`, `save()`, `widget(title \| n)`), `widgetConfig` (`section(title)`, `save()`, `cancel()`, both wait until the configuration is gone), `dataGrid(scope?)` (`rows`, `row(text \| n)`, `cell(row, header)`, `rowAction`, `reload()`), `confirmModal` (`confirm()`, `cancel()`), `alerts` (`messages`, `closeAll()`). `DASHBOARD_READY` is the `waitFor` for a dashboard view |

| `cy(name)`, `NAV_NODE`, `ROW`, `SETTINGS`, …, `rowNamed`, `openDrawer`, `openSettings`, `openSettingsTab`, `openLevel`, `closeSettings`, `exact` (`navigation-and-search.ts`) | The navigation-and-search plugin's hooks and steps, shared by its six spec files |

### `playwright/selectors.ts` — the Web SDK's selectors, generated

`pnpm run e2e:selectors` writes it from the installed `@c8y/ngx-components`: one object per component, a function
where the template builds the value (`selectors.dataGrid.header('Name')` → `[data-cy="data-grid--Name"]`), the
component's tag as the comment. Specs never hard-code a Web SDK `data-cy` value: a renamed selector is then a type
error, not a silent timeout. A plugin's own `data-cy` hooks (`navigation-and-search--…`, `smart-views--…`) stay
literal. Elements without a `data-cy` (tabs' text, breadcrumbs, most of a wizard) keep the tag, `title` or role.

Add a helper to `support/` when a second spec needs it (a plugin with several spec files gets a module of its own, like `navigation-and-search.ts`); add generic ones to the ui-sdk instead (the drivers for navigator, tabs, action bar, select and date picker are on its roadmap).

---

## Writing a New Spec

Follow the project skill `.claude/skills/write-e2e-cumulocity-playwright-test/SKILL.md` (discover → write → verify
in a loop → finish). The shape:

```ts
// playwright/my-plugin.spec.ts
import { expect, settleClock, test } from './support/fixtures';

test.describe('My Plugin', () => {
  let device: { id: string; name: string };

  test.beforeAll(async ({ mock, api }) => {
    await mock.reset();
    device = (await (await api.get('/inventory/managedObjects?fragmentType=c8y_IsDevice&pageSize=1')).json()).managedObjects[0];
  });

  test.beforeEach(async ({ mock }) => {
    await mock.reset();
  });

  test('adds the widget', async ({ page, visitApp }) => {
    await visitApp(`device/${device.id}`, { language: 'en', waitFor: 'c8y-tabs-outlet' });
    // …
    await expect(page.locator('my-plugin-widget')).toBeVisible();
  });
});
```

- The file name starts with the package folder name (`<plugin>[-<area>].spec.ts`): that is how the config and CI
  find a plugin's specs. Nothing else to register.
- A plugin without `contextPath` in its `cumulocity.config.ts` is served under the path derived from `runTime.name`;
  `support/remotes.ts` handles it.
- One `reviewScreenshot('<plugin>/<view>')` per view the plugin renders (widget on the dashboard, config dialog,
  page), at the end of the test that shows it in its typical state. Mask what differs between two runs of the same
  code (a generated id, a live clock): `mask: [page.locator(…)]`.
- `await settleClock(page)` after an in-app navigation click or typing into a search or filter field that debounces,
  or the frozen run waits forever. Verify a spec with `--frozen` too before finishing.

---

## Test Data

Every test starts from the world file (`mock.reset()` in `beforeEach`): objects a test creates with `api` need no
tagging, unique names or teardown. Arrange state on the mock rather than stubbing responses; `page.route` only for
failures (`route.fulfill({ status: 500, json })`) and responses changed in flight (`route.fetch()` then
`route.fulfill({ response, json })`). Derived data the mock computes (`c8y_Availability`) is set through the world
(`availability.ts`), not through a PUT.

---

## What to Avoid

- **Do not** `page.goto` an app URL by hand — `visitApp` builds the shell URL with the remotes.
- **Do not** run against a real tenant: the fixtures reset and rewrite the world they are pointed at.
- **Do not** use `page.waitForTimeout` — wait on locators, requests (`page.waitForRequest`) or mock state
  (`expect.poll`).
- **Do not** re-add generic helpers (page objects, factories) here — add them to `@cumulocity-iot/ui-sdk`.
- **Do not** hard-code a Web SDK `data-cy` value or edit `selectors.ts` by hand — use `selectors.*` and regenerate the file after a Web SDK bump.
- **Do not** commit `playwright-results/`, `playwright-report/` or `mock/` (git-ignored).
- **Do not** install packages into `test/node_modules` directly — declare them in `test/package.json`.
