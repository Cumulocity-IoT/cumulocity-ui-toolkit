# UI Toolkit Changelog

## 2026.10.27 — ui-sdk 1.3.1

**Test infrastructure**: `@cumulocity-iot/ui-sdk` 1.2.0 → 1.3.1 in `test/`. The release brings `c8y-ui dev --apps <dir>,…` (several plugins with hot reload behind one router on the tenant mock) and its Vite plugin now shares every sub-entry the dev shell provides (`@c8y/ngx-components/device-grid`, `ngx-bootstrap/modal`, …), which fixes `NG0201` provider errors of such components in Vite dev.

## 2026.10.26 — ui-sdk Cypress helpers

**Test infrastructure**: the e2e specs use the Cypress helpers of `@cumulocity-iot/ui-sdk` 1.2.0 (`cy.visitApp`, `AddWidgetDialog`, `Dashboard`, dashboard/widget selectors) instead of the suite's own support library, which is removed. `test/config/base.config.ts` passes the shell and the `?remotes=` value as `C8Y_SHELL` / `C8Y_REMOTES`.

## 2026.10.26 — type-only imports

**Code**: type-only imports and exports are marked with `type` across all packages (`verbatimModuleSyntax` in `tsconfig.json`, ESLint `consistent-type-imports` / `consistent-type-exports`), so the plugins also run under per-file compilers such as a Vite dev server. Rule in `AGENTS.md` → Code Conventions.

- **tenant-option-management**: the JSON editor re-exported its interfaces as values and the grids used `ColumnDataType.*` from a `const enum` that `@c8y/ngx-components` does not export at runtime — both broke the plugin in a Vite dev server (`does not provide an export named 'IError'`). The column types are literals now.
- **shared**: `GridColumnWidthService` and `LocationRealtimeService` use `inject()` instead of constructor parameters.

**asset-navigator 1.2.0**: no longer assumes the windy wind-farm data model — device/asset counts, availability from `c8y_Availability`, and a configurable detail panel described by a JSON Schema data contract (with a "Detail fields…" editor in the options menu) — see `packages/asset-navigator/CHANGELOG.md`.

**asset-navigator 1.1.0**: options menu for the asset tree (search, shortcut, Pinned & Recent, inventory fallback without DTM), stored per user — see `packages/asset-navigator/CHANGELOG.md`.

**New plugin**: `packages/smart-views` (from #70) — query-driven asset views with a configuration page under Settings and CSV export, now on Web SDK 1024.21.x / Angular 21. Registered in `angular.json` with build/serve/test targets and covered by unit tests and an e2e suite on the tenant mock. See `packages/smart-views/CHANGELOG.md`.

**Shared library** (additive, no change for existing plugins): `CsvExportService` (CSV conversion + browser download), DTM models and `DtmService.getAssetDefinition()` / `getPropertyDefinitions()`, and an internal `ReverseQueriesUtil` helper (query string → QueriesUtil JSON; not exported).

**New plugin**: `packages/events-graph-widget` — device events as colored state bars on a zoomable timeline, moved into the monorepo from PR #34 and ported to Web SDK 1024 / Angular 21. See `packages/events-graph-widget/CHANGELOG.md`.

**Dependencies**: Pinned `undici@7` to `^7.30.1` via a pnpm override to fix GHSA-xjj6-f33q-929c (denial of service on excessive content-encodings), which failed the `pnpm audit` CI step. It reaches the workspace through `@angular/build` and `@c8y/devkit`. The accepted (unfixable) advisories on the audit ignore list are now documented in `AGENTS.md` → Dependency Audit.

## 2026.10.23

**New plugin**: `packages/asset-navigator` — asset tree explorer drawer in the navigator and a global asset search (`⌘K` / `Ctrl+K`), ported from the windy solution. See `packages/asset-navigator/CHANGELOG.md`.

**Docs**: `AGENTS.md` now requires changelog entries for every user-facing change (per-plugin `CHANGELOG.md` plus this file for repository-wide changes).

## 2026.05.13

**Build Tools**: Added new locale conversion utility:

- Created `tools/convert-locales.js`: Automatically converts JSON locale files to PO (gettext) format for easier translation management
- Added `locales:convert` script to root `package.json`
