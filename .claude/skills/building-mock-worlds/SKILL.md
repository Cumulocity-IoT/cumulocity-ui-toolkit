---
name: building-mock-worlds
description: >-
  Step 2 (DATA) of building a Cumulocity Web SDK app. Use when the UI needs data on the emulated tenant: devices,
  groups, measurements, alarms, events, operations, users, or dashboards with widgets — anything that has to be in
  `mock/world.json` so the app and its tests show something real. Covers the world format (series generators,
  dashboard sugar, live clock), widget configs that render, `c8y-ui world check`, and saving what was built in the UI.
---

# Building mock worlds

Reference: `references/world-format.md` (the file format) and `references/widgets.md` (widget configs that render).

The mock is a dynamic Cumulocity REST emulator: reads query the world, writes change it (until `POST /_mock/reset`
or a restart). The world file is the single source of the app's demo and test data — not code, not interceptors.

## 1. Model the domain first

Before writing JSON, list what the feature needs to show, and derive the minimum world:

- the **hierarchy**: groups (`c8y_IsDeviceGroup`) → devices (`c8y_IsDevice`) via `childAssets`;
- per device type: fragments the UI reads (`c8y_Position`, `c8y_Hardware`, `c8y_Firmware`, `c8y_Availability`, your own);
- **measurements** as `series` generators (fragment, series, unit, shape, range) — never hand-written points;
- **alarms / events / operations** with states the UI must render (one per severity/status the feature branches on);
- **dashboards** if the feature is a widget, or the user asks for a dashboard.

Use realistic names, units and value ranges for the domain. Keep ids numeric strings; group ids 1xxx, devices 2xxx,
alarms 3xxx, events 4xxx keeps a world readable.

## 2. Write it

Edit `mock/world.json` (or a new file under `mock/` for a test-specific world). Start from the starter world the app
was created with — or, when the user wants their real data, from a copy of the tenant: `c8y sessions set`, then
`pnpm exec c8y-ui world pull --root <groupOrDeviceId> --out mock/tenant.json` (go-c8y-cli does the login; never point
the dev server at the tenant instead; owner user names and email addresses are replaced in the copy). Key rules (details in `references/world-format.md`):

- `now` is the world's anchor; with `live` (default) every timestamp moves so that `now` is the moment the mock
  starts. Write times relative to `now`.
- `series`: `{ source, fragment, series, unit, every, span, shape, min, max, noise }` — `span` ends at `now`.
  Keep `span / every` ≤ a few thousand points per series.
- `dashboards`: `{ name, on: { group | device | type | name }, widgets: [{ componentId, title, x, y, width, height, config }] }`
  on a 24-column grid. The mock places them exactly like the cockpit does.
- Widget configs: copy from `references/widgets.md`. Every widget with a time range needs one, or it shows only
  the last hour. Data point widgets need `datapoints[].__active: true` and `__target: { id, name }`.

For large worlds (many devices, several dashboards), delegate to the `world-builder` agent with the domain
description and the list from step 1 — it writes and checks the file without filling your context.

## 3. Check

```sh
pnpm world:check
```

Fix every error. Warnings name real rendering problems (a widget without time range, a data point without data,
overlapping widgets) — fix them unless intended. Custom widget ids of the app go into `c8y-ui.json` → `widgets`.
The check also loads the world the way the mock does: data a tenant refuses (an alarm without `type`, a user with an
invalid email) is an error with the item's path, e.g. `alarms[1]`.

## 4. Look at it

With `pnpm start` running, the mock reloads the world on save and publishes what changed to realtime subscribers
(widgets that subscribe update; lists that poll catch up on their refresh, measurements after a page reload). Open the dashboard (group: `#/group/<id>`, device:
`#/device/<id>`) and confirm every widget shows data — use the Playwright MCP to screenshot when available.
`pnpm exec c8y-ui mock` alone serves the cockpit at `http://localhost:8111/apps/cockpit/` without the app.

Unanswered requests are printed by the mock as `mock 404 GET /…`. A 404 on an object id means the world lacks it; a
404 on an endpoint the app needs, or a 501, is an emulator gap: tell the user, do not paper over it in app code.

## 5. Keep what was built in the UI

Dashboards laid out by hand in the cockpit (edit mode, add widget) are stored in the mock. Save them:

```sh
pnpm exec c8y-ui world export --out mock/exported.json
```

Copy the new `c8y_Dashboard` objects (and their `childAdditions`) into the world, or replace them with `dashboards`
sugar. Measurements are left out of the export unless `--measurements`; keep using `series`.

## Rules

- Data goes into the world, never into components, services or Cypress intercepts.
- Run `pnpm world:check` after every change; zero errors before handing over.
- Do not invent widget config keys: use `references/widgets.md`, or export a widget configured in the UI.
- Tests that need a special state load their own world (`cy.loadWorld('worlds/<name>.json')` from
  `cypress/fixtures/`) instead of changing the shared one.
