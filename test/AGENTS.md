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
│   ├── operations-widget.config.ts
│   ├── release-notes.config.ts
│   ├── reminder.config.ts
│   └── tenant-option-management.config.ts
└── cypress/
    ├── e2e/                      # One spec file per plugin
    ├── support/
    │   ├── e2e.ts                # Global setup: commands, logs, teardown, error handlers
    │   ├── commands.ts           # Custom Cypress command declarations + registrations
    │   ├── index.ts              # Barrel — import everything from '../../support'
    │   ├── api/                  # Live C8Y API helpers (use cy.c8yclient inside)
    │   ├── factories/            # Pure data builders (no Cypress commands)
    │   ├── intercepts/           # cy.intercept stubs for inventory + dashboard mocking
    │   ├── page-objects/         # Typed page-object classes for C8Y shell components
    │   ├── selectors/            # Typed data-cy selector constants for C8Y platform
    │   └── utils/                # Test-ID registry and other pure helpers
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

Everything lives under `cypress/support/`.  Import from the barrel for
convenience:

```ts
import {
  mockDevice, mockDashboard, stubDeviceDashboard,
  C8yWidgetModal, DashboardSelectors, registerTestId,
  createGroup, createUserWithGlobalRoles,
} from '../../support';
```

Or import from the sub-module directly for targeted imports:

```ts
import { mockDevice } from '../../support/factories';
import { DashboardSelectors } from '../../support/selectors';
import { stubDeviceDashboard } from '../../support/intercepts';
```

### `api/` — Live backend helpers

All functions use `cy.c8yclient` internally and return `Cypress.Chainable`.
Call them inside Cypress command chains or hooks — never in plain callbacks.

| Export | Description |
|---|---|
| `createGroup(c, options)` | Creates a `c8y_DeviceGroup` MO with `c8y_CypressTestGroup` marker |
| `createDevice(c, options)` | Creates a `c8y_IsDevice` MO with `c8y_CypressTestDevice` marker |
| `assignToGroup(c, groupId, assetId)` | Assigns a managed object as child asset |
| `createGroupHierarchy(hierarchy, cy_testId)` | Recursively builds a group tree, sets `.id` on each node |
| `clearAllManagedObjectsOfTest(cy_testId)` | Deletes all MOs tagged with `cy_testId` — called by the global teardown |
| `createGlobalRole(name, permissions)` | Creates a global user-group role with given permission strings |
| `deleteGlobalRoles(groupNames)` | Deletes global roles by name |
| `createInventoryRoleWithPermissions(name, permissions)` | Creates an inventory role; handles 409 (already exists) |
| `assignInventoryRoleToGroupForUser(role, groupId, user)` | Assigns inventory role to user for a specific MO |
| `createUserWithGlobalRoles(user, roles)` | Creates a user and assigns global roles by name |
| `deleteUsers(users)` | Deletes an array of users |
| `cleanupCypressUsers()` | Deletes all users whose `userName` starts with `cypress` |
| `isApplicationInstalled(nameOrKey)` | Returns `true` when a given app key is subscribed to the tenant |

> **Note:** `createGlobalRole` and `deleteGlobalRoles` are also available as
> built-in `cy.createGlobalRole()` / `cy.deleteGlobalRoles()` commands
> provided by `cumulocity-cypress` 1.x.  Prefer the built-ins in spec files;
> use the api functions inside helper functions.

### `factories/` — Pure data builders

No Cypress commands — safe to call anywhere including before `cy.visit`.

| Export | Description |
|---|---|
| `createManagedObject(parts?)` | Full `IManagedObject` skeleton with random `id` |
| `mockDevice(parts?)` | `createManagedObject` + `c8y_IsDevice: {}` |
| `mockGroup(parts?)` | `createManagedObject` + `c8y_IsDeviceGroup: {}` |
| `mockId()` | Random 16-digit numeric string |
| `dynamicClone(mo)` | Deep-clones an MO and stamps it with a fresh `id`/`name` |
| `mockTenantOptionResponse(value)` | Wraps a value in the `GET /tenant/options` envelope |
| `mockDashboard(target, widgets?)` | Full dashboard MO with `c8y_Dashboard` fragment |
| `mockWidget(fragments?)` | Widget descriptor with random `id`/`componentId` |
| `getWidgetConfigs(putBody)` | Extracts widget config array from a dashboard PUT body |
| `mockListResponse(data, stats?)` | C8Y paged-list envelope (`managedObjects`/`events`/`measurements`) |
| `mockChildAssetsResponse(data, stats?)` | Child-assets reference envelope |
| `generateUser(displayName)` | Unique `IUser` with `cypress-` prefixed `userName` |
| `getUUID()` | Random UUID string |
| `createEvent(parts?)` | Minimal valid `IEvent` |
| `createMeasurement(overrides?)` | `c8y_Temperature.T` measurement with random value |
| `mockMeasurementsResponse(count, interval)` | List of measurements spread backward in time |

### `intercepts/` — cy.intercept stubs

Use these to avoid hitting the backend for **view/edit** tests.  Stubs are
registered synchronously; call them before `cy.visit`.

#### Inventory stubs

```ts
// Stub a single device (all standard GET variants)
mockInventoryObject(device.id, deviceData);

// Stub a group + its children
mockInventoryGroup(group, [child1, child2]);

// Suppress the Gainsight MO lookup that blocks page load
interceptAndMockGainsight();
```

#### Widget simulator — pre-load a widget into a mocked dashboard

```ts
// View an existing widget
const widget = mockWidget({ componentId: 'my-widget', config, _width: 6, _height: 4 });
stubDeviceDashboard(device, deviceFixture, [widget]);
cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', 'my-widget');

// Empty dashboard → add widget from UI
stubDeviceDashboard(device, deviceFixture, []);
cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', DashboardSelectors.WIDGET_EDIT_READY);
enterEditMode();
C8yWidgetModal.selectWidget('My Widget Name');

// Convenience wrappers that stub + navigate in one call
visitDeviceWithWidget(device, fixture, [widget], 'my-widget');
visitDeviceWithEmptyDashboard(device, fixture);
visitGroupWithWidget(group, children, [widget], 'my-widget');

// Dashboard save assertion
const saveAlias = interceptDashboardSave(dashboard.id);
cy.get(DashboardSelectors.SAVE).click({ force: true });
assertWidgetConfigSaved(saveAlias, expectedConfig, ['history']);
```

### `page-objects/` — Typed page-object classes

| Class | Description |
|---|---|
| `C8yDashboard` | `createDashboardForDevice`, `createDashboardForGroup`, `saveLayoutIfVisible` |
| `C8yAddWidgetDialog` | `openAddWidgetModal`, `openAndSelect(widgetName)`, `selectAnyDevice`, `selectDevice(name)`, `saveAndClose` |
| `C8yWidgetModal` | `selectWidget(name)`, `selectWidgetAndAnyDevice(name)`, `waitForConfigToLoad`, `openOnContext(path, name, opts)` |
| `C8yDataGrid` | `getSortButtonOfColumn`, `getFilterButtonOfColumn`, `getRow(index)`, `getEditActionButton`, `getDeleteActionButton` |
| `C8yConfirmationModal` | `ok()`, `cancel()`, `getButton(title)` |
| `C8ySelect` | `toggleDropdown()`, `selectItem(text)`, `apply()` |
| `C8yAlert` | `containsText(text)` |
| `C8ySideMenu` | `toggleMenu()`, `clickMainNode(title)`, `clickSubNode(title)` |
| `C8yTabMenu` | `getButton(title)`, `getAddDashboardButton()` |

Free functions:

```ts
enterEditMode();            // clicks "Edit widgets" toolbar button
clickEditWidgetMenuItem();  // gear icon → "Edit widget" on first widget
openWidgetForEditing();     // enterEditMode + clickEditWidgetMenuItem + waitForConfigToLoad
saveWidgetAndDashboard();   // widget Save → dashboard Save
visitAndWaitForSettingsLoaded(item?); // opens navigator → Settings
```

### `selectors/` — Typed data-cy selector constants

Import directly from the barrel or from individual files.

| Export | Covers |
|---|---|
| `DashboardSelectors` | Edit, Add widget, Save, Reset toolbar buttons |
| `WidgetChildSelectors` | Per-widget gear/settings icon |
| `WidgetMenuSelectors` | Edit widget, Remove widget menu items |
| `WidgetConfigSelectors` | Widget picker search, list, Save, Cancel |
| `DataGridSelectors` | Table rows, checkboxes, edit/delete buttons |
| `DataGridFilterSelectors` | Filter panel, chips, reload, counter |
| `DataGridColumnSelectors` | Sort, filter, header, cell, action buttons |
| `AlarmListSelectors` | Alarm list, text, badge, clear-all |
| `AlarmFilterSelectors` | Severity filter chips with `.bySeverity(s)` helper |
| `EventListSelectors` | Event list, text, date, attachment |
| `NavigatorSelectors` | `.node(title)`, `.settingsNode(title)` |
| `HeaderBarSelectors` | User dot, toggle, more |
| `TabMenuSelectors` | `.tab(title)`, Add dashboard |
| `ConfirmModalSelectors` | OK, Cancel, `.button(title)` |
| `AlertSelectors` | Message, close |
| `DashboardDetailSelectors` | Save/cancel on create-dashboard form |
| `GlobalDateContextSelectors` | Date context apply, interval, aggregation |
| `DatapointSelectorSelectors` | Add datapoint, toggle visibility |
| `PackagesSelectors`, `PluginSelectors` | Admin app extension management |
| `BrandingSelectors` | Branding form controls |

### `utils/`

| Export | Description |
|---|---|
| `registerTestId(id)` | Registers `id` in the global `testIdRegistry` so managed objects created with `cy_testId = id` are auto-deleted after the spec finishes |
| `testIdRegistry` | The singleton `TestIdRegistry` instance (rarely needed directly) |

---

## Custom Commands

Registered in `support/commands.ts`, available on `cy.*` in all specs.

| Command | Description |
|---|---|
| `cy.visitShellAndWaitForSelector(url, lang?, selector?, timeout?)` | Navigate to a shell route, set language, inject remotes if `C8Y_SHELL_EXTENSION` is set, wait for selector |
| `cy.createGroup(options)` | Wraps `createGroupApi` — returns the created `IManagedObject` |
| `cy.createDevice(options)` | Wraps `createDeviceApi` |
| `cy.assignDevice(groupId)` | Subject-chained: assigns the yielded device to `groupId` |
| `cy.interceptDashboardLoad(id, context, handler)` | Intercepts the dashboard query for a device or group |
| `cy.createGroupHierarchy(hierarchy, cy_testId)` | Recursively creates a group tree |
| `cy.configureApplicationAccess(role, appNames)` | Adds apps to a global role's access list |
| `cy.createInventoryRoleWithPermissions(name, permissions)` | Creates an inventory role |
| `cy.assignInventoryRoleToGroupForUser(role, groupId, user)` | Assigns inventory role |
| `cy.deleteInventoryRole(name)` | Deletes an inventory role by name |
| `cy.createUserWithGlobalRoles(user, roles)` | Creates a user and assigns global roles |
| `cy.deleteUsers(users)` | Deletes an array of users |

Commands provided **natively by `cumulocity-cypress` 1.x** (do not redefine):
`cy.getAuth`, `cy.login`, `cy.createUser`, `cy.deleteUser`, `cy.createGlobalRole`,
`cy.deleteGlobalRoles`, `cy.c8yclient`, `cy.setLanguage`, `cy.disableGainsight`.

---

## Writing a New Spec

### 1. Create the spec file

```ts
// cypress/e2e/my-plugin.cy.ts

import { registerTestId, mockDevice, stubDeviceDashboard, mockWidget,
         visitDeviceWithWidget, DashboardSelectors } from '../../support';

const CYPRESS_TEST_ID = 'my-plugin-tests';
registerTestId(CYPRESS_TEST_ID); // auto-cleanup after spec

describe('My Plugin', () => {
  const device = { name: 'Test Device', id: mockId() };

  before(() => {
    Cypress.session.clearAllSavedSessions();
    cy.getAuth().login();
    cy.createGroup({ name: 'Test Group', cy_testId: CYPRESS_TEST_ID });
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('renders the widget', () => {
    const widget = mockWidget({ componentId: 'my-plugin-widget', config: {} });
    visitDeviceWithWidget(device, { ...device, c8y_IsDevice: {} }, [widget], 'my-plugin-widget');
    cy.get('my-plugin-widget').should('be.visible');
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

## Test Cleanup Pattern

All managed objects created against the live backend must be tagged with a
`cy_testId` field so the global `after()` hook in `e2e.ts` can delete them:

```ts
// At the top of every describe block that creates backend data
const CYPRESS_TEST_ID = 'my-plugin-tests';
registerTestId(CYPRESS_TEST_ID);

// Pass cy_testId when creating inventory objects
cy.createGroup({ name: 'My Group', cy_testId: CYPRESS_TEST_ID });
cy.c8yclient((c) => createGroup(c, { name: 'My Group', cy_testId: CYPRESS_TEST_ID }));
```

`clearAllManagedObjectsOfTest(CYPRESS_TEST_ID)` queries the inventory with
`cy_testId eq '<id>'` and cascade-deletes every match.  Each per-plugin config
runs a narrow `specPattern` so only that plugin's test IDs accumulate per run.

---

## Two Test Modes

### Intercept-based (unit-style) — no backend required

Use `stubDeviceDashboard` / `visitDeviceWithWidget` to load a pre-configured
widget without a live backend.  Ideal for widget rendering, config form, and
save-assertion tests.

```ts
const widget = mockWidget({ componentId: 'my-widget', config: { threshold: 42 } });
const dashboard = stubDeviceDashboard(device, deviceFixture, [widget]);
const saveAlias = interceptDashboardSave(dashboard.id);

cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', 'my-widget');
// ... interact with widget config ...
saveWidgetAndDashboard();
assertWidgetConfigSaved(saveAlias, { threshold: 42 });
```

### Live backend (integration-style)

Use `cy.getAuth().login()` + `cy.createGroup` / `cy.createDevice` to
provision real data.  Tag everything with `cy_testId` and call
`registerTestId` so it is cleaned up automatically.

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
- **Do not** call api functions (e.g. `createGroup`) outside a Cypress command
  chain — they use `cy.c8yclient` internally and will fail outside a test
  context.
- **Do not** create managed objects without a `cy_testId` tag unless you clean
  them up explicitly in `after()`.
- **Do not** use `cy.wait(N)` for arbitrary time delays — use
  `cy.get(selector).should('be.visible')` or `cy.wait('@alias')` instead.
- **Do not** commit credentials.  Use the root `.env` file (git-ignored).
- **Do not** install packages into `test/node_modules` directly — all
  dependencies are declared in `test/package.json` and managed by pnpm.
