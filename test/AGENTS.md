# AGENTS.md — Cypress E2E Test Suite

Guidance for AI agents working in the `test/` directory.

---

## Overview

This is the end-to-end test suite for the UI Toolkit plugins.  Every plugin in
`packages/` has a corresponding spec file here.  Tests run against a live
Cumulocity tenant with the plugin deployed via the Angular dev server
(`serve:<plugin>` from the root).

**Tech stack:** Cypress 15 · `cumulocity-cypress` 1.8.4 · TypeScript 5.9 · pnpm

---

## Layout

```
test/
├── package.json                  # Own pnpm workspace — install separately
├── tsconfig.json                 # Cypress-targeted tsconfig (es5, dom, no modules)
├── cypress.config.ts             # Default config (delegates to config/base.config.ts)
├── config/
│   ├── base.config.ts            # Shared config factory (auth, plugin setup, env vars)
│   ├── favorites-manager.config.ts
│   ├── kpi-widget.config.ts
│   ├── energy-consumption-widget.config.ts
│   ├── events-graph-widget.config.ts
│   ├── operations-widget.config.ts
│   ├── release-notes.config.ts
│   ├── reminder.config.ts
│   ├── smart-views.config.ts
│   └── tenant-option-management.config.ts
└── cypress/
    ├── e2e/                      # One spec file per plugin
    ├── support/
    │   ├── e2e.ts                # Global setup: cumulocity-cypress, ui-sdk commands, logs, failed-DOM dump
    │   ├── commands.ts           # cy.createDevice
    │   └── intercepts/           # asset-navigator.intercepts.ts (tenant-mock query shim)
    └── logs/                     # Failed-DOM dumps (auto-written on test failure)
```

---

## Prerequisites

### Install

Dependencies are **not** hoisted from the root — install separately:

```bash
cd test
pnpm install
```

### Environment variables

Create a `.env` file at the **repository root** (`../../.env` relative to
`test/`).  The `base.config.ts` loads it automatically via `dotenv`.

```ini
# Required
C8Y_USERNAME=your-test-user
C8Y_PASSWORD=your-password
C8Y_TENANT=t123456789

# Optional — defaults shown
C8Y_CYPRESS_URL=http://localhost:9001/
C8Y_SHELL_TARGET=cockpit
```

`C8Y_TOKEN` is populated automatically at startup via `oauthLogin` (falling
back to basic auth when OAuth is unavailable).

---

## Running Tests

### Against the tenant mock (default, used by CI)

No tenant or credentials needed. `scripts/e2e-mock.mts` starts the
[`@cumulocity-iot/ui-sdk`](https://github.com/Cumulocity-IoT/c8y-ai-ui-sdk) mock with the
**windy-dev world** (`mock/windy-dev.json`, pulled from the tenant at runtime — never committed, git-ignored) and the **cockpit release build of the Web SDK
version the workspace is on** (root `package.json` → `@c8y/ngx-components`), serves the plugin
against it (`ng serve -u <mock>`) and runs the plugin's Cypress config. After a Web SDK bump it
downloads the new cockpit on the next run and records its checksum in `c8y-ui.json` → commit that.

| Purpose | Root command |
|---|---|
| Run one plugin's suite on the mock | `pnpm run e2e:mock <name>` (`--browser=chrome` locally; CI uses chromium) |
| Same, in the Cypress UI | `pnpm run e2e:mock <name> --open` |
| Re-pull the world from windy-dev | `pnpm run e2e:world:pull` (`e2e:mock` does it when the file is missing) |
| Run one plugin's suite in another cockpit release | `E2E_SHELL_VERSION=1024.22.1 pnpm run e2e:mock <name>` (what `shell-compat.yml` does daily with the latest CD release; `E2E_MOCK_GAPS=<file>` lists the requests the mock does not emulate). Rewrites `c8y-ui.json` → `version` and adds the checksums; do not commit that |

- `c8y-ui.json` — mock config: version (synced automatically), shell `cockpit`, world, ports
  (mock 8111, dev server 9001), `auth: login` (so `cy.getAuth().login()` works; any password
  is accepted), shell checksums.
- The world is windy-dev's energy site "Cuxhaven" (`WORLD_ROOT` overrides the root id): devices,
  7 days of measurements and alarms, the newest 50 events per source. It is pulled through
  go-c8y-cli: locally with your session (`C8Y_SESSION=~/.cumulocity/windy-dev…json`), in CI
  with `C8Y_HOST` / `C8Y_USER` / `C8Y_PASSWORD` from the `e2e` environment (`WINDY_C8Y_*`).
  Writes from tests stay in the mock until it stops; every run starts from the file.
- Microservices, smart rules and Notifications 2.0 are not emulated — see the ui-sdk's
  `docs/mock.md` for what the mock answers.
- Installing needs read access to GitHub Packages for `@cumulocity-iot` (see the root
  `AGENTS.md` → MCP Servers for the `~/.npmrc` setup).

### Against a real tenant

All commands run from inside `test/`.

| Purpose | Command |
|---|---|
| Open Cypress UI (all specs) | `pnpm cy:open` |
| Run headless (all specs) | `pnpm cy:run` |

Per-plugin configs are invoked from the **repository root** via the generated
scripts:

| Purpose | Root command |
|---|---|
| Open Cypress UI for one plugin | `pnpm run e2e:open:<name>` |
| Run headless for one plugin | `pnpm run e2e:run:<name>` |

The per-plugin config files in `config/` set the correct `specPattern` and
inject the plugin's module federation `remotes` JSON so the shell loads the
locally-served plugin.

---

## Config System

### `config/base.config.ts`

The central factory.  Configures:

- `configureC8yPlugin` — enables `cy.c8yclient`, `cy.getAuth`, and all other
  `cumulocity-cypress` commands.
- `oauthLogin` — fetches a bearer token at startup and writes it to
  `C8Y_TOKEN` (tests that use `cy.getAuth().login()` pick this up
  automatically).
- `installLogsPrinter` — streams Cypress command logs to the terminal.
- `allowCypressEnv: true` — allows `Cypress.env()` reads from `cypress.json`
  and `--env` flags.
- `env.C8Y_SHELL` (from `C8Y_SHELL_TARGET`) and `env.C8Y_REMOTES` (the per-plugin
  config's remotes JSON) — what `cy.visitApp` loads: `/apps/<C8Y_SHELL>/index.html?remotes=<C8Y_REMOTES>#/<path>`.

### Per-plugin config

```ts
// config/my-plugin.config.ts
import { baseConfig } from './base.config';
import myPlugin from '../../packages/my-plugin/cumulocity.config';

export default baseConfig(
  JSON.stringify(myPlugin.runTime.remotes),  // module federation remotes JSON
  ['cypress/e2e/my-plugin.cy.ts'],           // specPattern
);
```

---

## Support Library

Generic helpers come from [`@cumulocity-iot/ui-sdk`](https://github.com/Cumulocity-IoT/c8y-ai-ui-sdk)
(its `writing-e2e-tests` skill documents them); `cypress/support/` only holds what is specific to this repo.

### `@cumulocity-iot/ui-sdk/cypress` (imported by `support/e2e.ts`)

| Command / export | Purpose |
|---|---|
| `cy.visitApp(path, { language, waitFor, timeout })` | Open `path` in the shell `C8Y_SHELL` with the plugin's remotes (`C8Y_REMOTES`), set the UI language (localStorage `c8y_language`), wait until `waitFor` is visible |
| `cy.resetWorld()`, `cy.loadWorld(world)`, `cy.mockRequests()` | Tenant-mock state and request log |
| `Dashboard` | `enterEditMode()`, `save()`, `saveIfVisible()`, `editWidget(index)` |
| `AddWidgetDialog` | `open()`, `openAndSelect(name)` (reopens while the plugin is still loading), `selectAsset(name)` |
| `WidgetConfigModal` | `waitForConfig()`, `save()`, `cancel()` |
| `enterEditMode()`, `openWidgetForEditing(index?)`, `saveWidgetAndDashboard()` | Edit-mode shortcuts |
| `DashboardSelectors`, `WidgetSelectors`, `WidgetConfigSelectors` | The data-cy selectors those use |

Importing the module also ignores the dashboard grid's `ResizeObserver loop` errors
(`allowResizeObserverErrors()` turns that off).

```ts
import { AddWidgetDialog, DashboardSelectors, openWidgetForEditing } from '@cumulocity-iot/ui-sdk/cypress';
```

### `@cumulocity-iot/ui-sdk/factories` — platform-shaped data (Node-safe)

`createManagedObject`, `mockDevice`, `mockGroup`, `mockDashboard(target, widgets)`, `mockWidget`,
`getWidgetConfigs`, `mockListResponse(items, { key, statistics })`, `mockChildAssetsResponse`, `mockEvent`,
`mockMeasurement`, `mockMeasurementsResponse`, `mockTenantOptionResponse`, `mockId` — for `cy.intercept`
stubs, e.g. `cy.intercept('GET', '**/inventory/managedObjects?*', mockListResponse([mockDevice()]))`.

### `cypress/support/` (this repo)

| Helper | Purpose |
|---|---|
| `cy.createDevice(options)` | Creates a device (`c8y_IsDevice`) via `cy.c8yclient`, yields the managed object |
| `interceptAssetNavigatorInventoryQueries()` | Rewrites `_id` → `id` in inventory queries (tenant-mock gap) |

Commands provided **natively by `cumulocity-cypress` 1.x** (do not redefine):
`cy.getAuth`, `cy.login`, `cy.createUser`, `cy.deleteUser`, `cy.createGlobalRole`,
`cy.deleteGlobalRoles`, `cy.c8yclient`, `cy.setLanguage`, `cy.disableGainsight`.

---

## Writing a New Spec

### 1. Create the spec file

```ts
// cypress/e2e/my-plugin.cy.ts
import { AddWidgetDialog, DashboardSelectors } from '@cumulocity-iot/ui-sdk/cypress';

describe('My Plugin', () => {
  let device: IManagedObject;

  before(() => {
    cy.getAuth().login();
    cy.createDevice({ name: 'My plugin device' }).then((d) => (device = d));
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('adds the widget', () => {
    cy.visitApp(`device/${device.id}`, { language: 'en', waitFor: DashboardSelectors.WIDGET_EDIT_READY });
    AddWidgetDialog.openAndSelect('My Widget');
    cy.get('my-plugin-widget-config').should('be.visible');
  });
});
```

### 2. Create the config file

```ts
// config/my-plugin.config.ts
import { baseConfig } from './base.config';
import myPlugin from '../../packages/my-plugin/cumulocity.config';

export default baseConfig(
  JSON.stringify(myPlugin.runTime.remotes),
  ['cypress/e2e/my-plugin.cy.ts'],
);
```

### 3. Register the scripts

Run from the **repository root**:

```bash
pnpm run generate:scripts
```

This auto-generates `build:my-plugin`, `serve:my-plugin`, and `e2e:run:my-plugin`
in the root `package.json`.  Do **not** hand-edit those entries.

You also need to add the e2e script to the root `package.json` manually (the
generate script only covers build/serve/test):

```jsonc
// Root package.json — add manually to the e2e section:
"e2e:run:my-plugin": "pnpm -C test exec -- cypress run --browser chrome --config-file config/my-plugin.config.ts",
"e2e:open:my-plugin": "pnpm -C test exec -- cypress open --config-file config/my-plugin.config.ts"
```

---

## Test Data

Against the tenant mock every plugin run starts from a fresh mock with the world file, so objects a
spec creates (`cy.createDevice`, `cy.c8yclient((c) => c.inventory.create(…))`) need no tagging or
global teardown. Give them unique names (`Date.now()`) when specs could see each other's objects,
and delete what a test must not leave behind (e.g. events) explicitly. Against a real tenant, clean up
in `after()`.

To stub instead of create, register `cy.intercept` with factory data from
`@cumulocity-iot/ui-sdk/factories` before `cy.visitApp`.

---

## Authentication

Tests authenticate via `cy.getAuth()` which reads `C8Y_USERNAME` /
`C8Y_PASSWORD` / `C8Y_TOKEN` from `Cypress.env()`.

```ts
// Use the default admin credentials from .env
cy.getAuth().login();

// Use a specific test user
cy.getAuth('myuser', 'mypassword').login().disableGainsight();
```

Always call `Cypress.session.clearAllSavedSessions()` in `before()` when the
spec creates its own test user, so sessions do not leak between runs.

---

## What to Avoid

- **Do not** hand-edit `e2e:run:*` or `e2e:open:*` entries in the root
  `package.json` build/serve/test sections — run `generate:scripts` instead.
- **Do not** redefine commands already provided by `cumulocity-cypress` 1.x
  (`createGlobalRole`, `deleteGlobalRoles`, `createUser`, `deleteUser`, etc.)
  — TypeScript will catch the signature conflict at compile time.
- **Do not** re-add generic helpers (page objects, factories, selectors) to
  `cypress/support/` — add them to `@cumulocity-iot/ui-sdk` instead.
- **Do not** use `cy.wait(N)` for arbitrary time delays — use
  `cy.get(selector).should('be.visible')` or `cy.wait('@alias')` instead.
- **Do not** commit credentials.  Use the root `.env` file (git-ignored).
- **Do not** install packages into `test/node_modules` directly — all
  dependencies are declared in `test/package.json` and managed by pnpm.
