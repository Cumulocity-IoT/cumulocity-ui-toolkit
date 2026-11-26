---
name: developing-ui
description: >-
  Step 3 (BUILD) of building a Cumulocity Web SDK app. Use for any UI work in a Web SDK app or plugin — planning or
  implementing a widget, view, tab, navigator entry, form, modal, data grid, service or hook: look the Web SDK up in
  the c8y-web-sdk-knowledge MCP first (Codex docs, @c8y/* types, tutorial samples, REST API), reuse platform
  components, then build and verify the result on the mock with `pnpm start`.
---

# Developing UI with the Web SDK

Reference: `references/frontend-rules.md` (component, template, i18n, styling and accessibility rules — they apply
to every change).

## 1. Look it up before you plan

For every UI element or platform call the task needs, query the **`c8y-web-sdk-knowledge` MCP** before designing:

| Need | Call |
|---|---|
| "is there a component / how do I do X" | `search_concept({ query: "<what it does>", corpora: ["docs", "sample"] })` |
| exact API of a symbol (inputs, methods, hook types) | `resolve_symbol({ partial: "DataGrid" })` → `get_node({ node_key })` |
| how real code uses it | `find_usage({ symbol: "hookWidget" })` |
| which REST endpoint, parameters, response | `search_concept({ query: "…", corpora: ["api"] })` |

Read the matching doc page and one sample before writing code. Results flagged `[STALE]` come from an older Web SDK
major — prefer current ones. If the MCP is not connected (`claude mcp list`), say so and fall back to reading
`node_modules/@c8y/ngx-components` type declarations; do not guess APIs.

Use a platform component whenever one exists (`c8y-data-grid`, `c8y-form-group`, `c8y-ui-empty-state`,
`c8y-asset-selector`, `ModalService`, `AlertService`, …). Build custom UI only for what none covers.

## 2. Extend the shell the platform way

A plugin contributes through hooks and providers in its module/`index.ts` (exported in `cumulocity.config.ts`):
`hookNavigator`, `hookRoute`, `hookTab`, `hookAction`, `hookActionBar`, `hookWidget`, `hookComponent`,
`hookBreadcrumb`, … — look the exact signature up (`resolve_symbol`). New exports go into
`cumulocity.config.ts` → `runTime.exports`; the dev server picks them up after a restart of `pnpm start`.

Widgets: a view component plus a config component, registered with `hookWidget` (id, label, description,
`component`, `configComponent`, `data: { settings: { noDeviceTarget, … } }`). Add the widget's id to
`c8y-ui.json` → `widgets`, and put a dashboard using it into the world (`building-mock-worlds`).

## 3. Data comes from the platform API

- `@c8y/client` services (`InventoryService`, `MeasurementService`, `AlarmService`, `EventService`,
  `OperationService`, `FetchClient` for microservices) — never `HttpClient` for platform endpoints.
- Realtime: `@c8y/ngx-components` realtime services (they work on the mock: writes publish on CometD).
- The data the feature needs must exist in `mock/world.json`. Missing data → extend the world, not the code.

## 4. Implement

Follow `references/frontend-rules.md`. In short: standalone components, `OnPush`, signals for local state,
`input()`/`output()`, native control flow (`@if`, `@for`), `takeUntilDestroyed()` for subscriptions, every
user-visible string through `translate`, design tokens instead of colors, WCAG 2.1 AA.

## 5. Verify on the mock

```sh
pnpm dev:vite                  # mock + Vite with hot reload (plugins): template/style edits update in place
pnpm start                     # mock + the devkit dev server (what production builds use); check here before handing over
pnpm exec ng build             # must compile without errors
pnpm lint                      # no errors; fix warnings you introduced (pnpm lint:fix, pnpm format)
```

Iterate on templates and styles with `pnpm dev:vite` (no `vite.config.ts`? `pnpm exec c8y-ui vite setup`). It compiles
with OXC instead of the devkit's webpack, so confirm the finished feature once with `pnpm start` and `ng build`.
`NG0912` component-ID warnings in the console under Vite are expected (`node_modules/@cumulocity-iot/ui-sdk/docs/hot-reload.md`).

Open the feature in the browser (Playwright MCP when available): it renders, uses world data, has no console errors
and no `mock 404/501` lines in the terminal for requests it makes. Exercise every state: empty, loading, error
(make a request fail by referencing a missing id in a test world), many items.

Then: `writing-e2e-tests` for the user flow, `reviewing-code-quality` before handing over.

## Rules

- No code before the lookup in step 1; cite what you found (doc page or symbol) when you explain the design.
- Never hard-code demo data, tenant URLs, ids or credentials in source.
- Never bypass the mock: if the app needs an endpoint the mock does not answer, report it as an emulator gap.
- Keep `@c8y/*` at the version in `c8y-ui.json`; do not add Angular or `@c8y` packages in other versions.
