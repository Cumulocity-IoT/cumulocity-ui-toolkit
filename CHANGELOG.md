# UI Toolkit Changelog

## 2026.10.27 — shell compatibility check

**CI**: `shell-compat.yml` checks daily whether a newer cockpit CD release than the pinned Web SDK version is out and, if so, runs every plugin's e2e suite on the tenant mock inside it. A failure opens a `shell-compat` issue (or comments on the open one for that version); a pass closes it. `e2e-test.yml` names its screenshot artifacts per plugin, so PRs that change several plugins no longer fail on duplicate artifact names.

**Test infrastructure**: `e2e-mock.mts` takes `E2E_SHELL_VERSION` (run in another cockpit release) and `E2E_MOCK_GAPS=<file>` (list the requests the mock does not emulate).

## 2026.10.27 — Web SDK 1024 / Angular 21 (release v1.0.0)

**Breaking**: all plugins are built for Cumulocity Web SDK 1024.21.x and Angular 21 and need a 1024 cockpit; release v1.0.0 is the first of that line. Every plugin last released on 1023 gets a new major (0.x: minor) version — see each plugin's changelog.

**Review fixes** (per plugin in the plugin changelogs): bugs found reviewing the branch, each with a unit test that fails without the fix — events-graph bar placement, CSV injection and escaping, smart-view queries lost on edit, reminder tenant defaults, IndexedDB cache fallbacks, asset-navigator high-volume loading and search, layered-map resize on GridStack dashboards, tenant option import.

**Tooling**: class members ordered as the lint rule requires (no warnings left); `ignoreRestSiblings` for `no-unused-vars`; `@angular-eslint` template packages 20 → 21; `@types/jsoneditor` instead of an `any` declaration; `.pnpmfile.cjs` removed (devkit 1024 pins TypeScript 5.9.3 itself); index-db-cache is a provider array instead of an NgModule (exposed name unchanged). The `@angular-devkit/build-angular` override is documented in `AGENTS.md`.

**Test infrastructure**: `test/` uses `@c8y/client` 1024.21.3 like the rest of the workspace; real-tenant e2e runs default to the `cockpit` shell (was `cockpit-test-1023`).

## 2026.10.27 — ui-sdk 1.3.1

**Test infrastructure**: `@cumulocity-iot/ui-sdk` 1.2.0 → 1.3.1 in `test/`. The release brings `c8y-ui dev --apps <dir>,…` (several plugins with hot reload behind one router on the tenant mock) and its Vite plugin now shares every sub-entry the dev shell provides (`@c8y/ngx-components/device-grid`, `ngx-bootstrap/modal`, …), which fixes `NG0201` provider errors of such components in Vite dev.

**Dev tooling**: `pnpm run dev [<folder> …]` serves all (or the given) plugins with hot reload on the tenant mock — a thin wrapper (`tools/dev.mts`) around `c8y-ui dev --apps`; each plugin has a three-line `vite.config.ts` calling the ui-sdk's `c8yVite`. Root dev dependencies: `@cumulocity-iot/ui-sdk`, `vite` 8, `@module-federation/vite`, `@oxc-angular/vite`; `peerDependencyRules` lets `@module-federation/vite` take Vite 8 (the `vite@7` security override otherwise narrows its peer range).

## 2026.10.26 — ui-sdk Cypress helpers

**Test infrastructure**: the e2e specs use the Cypress helpers of `@cumulocity-iot/ui-sdk` 1.2.0 (`cy.visitApp`, `AddWidgetDialog`, `Dashboard`, dashboard/widget selectors) instead of the suite's own support library, which is removed. `test/config/base.config.ts` passes the shell and the `?remotes=` value as `C8Y_SHELL` / `C8Y_REMOTES`.

## 2026.10.26 — type-only imports

**Code**: type-only imports and exports are marked with `type` across all packages (`verbatimModuleSyntax` in `tsconfig.json`, ESLint `consistent-type-imports` / `consistent-type-exports`), so the plugins also run under per-file compilers such as a Vite dev server. Rule in `AGENTS.md` → Code Conventions.

- **tenant-option-management**: the JSON editor re-exported its interfaces as values and the grids used `ColumnDataType.*` from a `const enum` that `@c8y/ngx-components` does not export at runtime — both broke the plugin in a Vite dev server (`does not provide an export named 'IError'`). The column types are literals now.
- **shared**: `GridColumnWidthService` and `LocationRealtimeService` use `inject()` instead of constructor parameters.

**asset-navigator 1.2.0**: no longer assumes the windy wind-farm data model — device/asset counts, availability from `c8y_Availability`, and a configurable detail panel described by a JSON Schema data contract (with a "Detail fields…" editor in the options menu) — see `packages/asset-navigator/CHANGELOG.md`.

**asset-navigator 1.1.0**: options menu for the asset tree (search, shortcut, Pinned & Recent, inventory fallback without DTM), stored per user — see `packages/asset-navigator/CHANGELOG.md`.

**New plugin**: `packages/smart-views` (from #70) — query-driven asset views with a configuration page under Settings and CSV export, now on Web SDK 1024.21.x / Angular 21. Registered in `angular.json` with build/serve/test targets and covered by unit tests and an e2e suite on the tenant mock. See `packages/smart-views/CHANGELOG.md`.

**Shared library** (additive, no change for existing plugins): `CsvExportService` (CSV conversion + browser download), DTM models and `DtmService.getAssetDefinition()` / `getPropertyDefinitions()`.

**New plugin**: `packages/events-graph-widget` — device events as colored state bars on a zoomable timeline, moved into the monorepo from PR #34 and ported to Web SDK 1024 / Angular 21. See `packages/events-graph-widget/CHANGELOG.md`.

**Dependencies**: Pinned `undici@7` to `^7.30.1` via a pnpm override to fix GHSA-xjj6-f33q-929c (denial of service on excessive content-encodings), which failed the `pnpm audit` CI step. It reaches the workspace through `@angular/build` and `@c8y/devkit`. The accepted (unfixable) advisories on the audit ignore list are now documented in `AGENTS.md` → Dependency Audit.

## 2026.10.23

**New plugin**: `packages/asset-navigator` — asset tree explorer drawer in the navigator and a global asset search (`⌘K` / `Ctrl+K`), ported from the windy solution. See `packages/asset-navigator/CHANGELOG.md`.

**Docs**: `AGENTS.md` now requires changelog entries for every user-facing change (per-plugin `CHANGELOG.md` plus this file for repository-wide changes).

## 2026.05.13

**Build Tools**: Added new locale conversion utility:

- Created `tools/convert-locales.js`: Automatically converts JSON locale files to PO (gettext) format for easier translation management
- Added `locales:convert` script to root `package.json`
