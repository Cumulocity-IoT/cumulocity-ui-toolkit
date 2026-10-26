# UI Toolkit Changelog

## 2026.10.26

**Dependencies**: Pinned `undici@7` to `^7.30.1` via a pnpm override to fix GHSA-xjj6-f33q-929c (denial of service on excessive content-encodings), which failed the `pnpm audit` CI step. It reaches the workspace through `@angular/build` and `@c8y/devkit`. The accepted (unfixable) advisories on the audit ignore list are now documented in `AGENTS.md` → Dependency Audit.

## 2026.10.23

**New plugin**: `packages/asset-navigator` — asset tree explorer drawer in the navigator and a global asset search (`⌘K` / `Ctrl+K`), ported from the windy solution. See `packages/asset-navigator/CHANGELOG.md`.

**Docs**: `AGENTS.md` now requires changelog entries for every user-facing change (per-plugin `CHANGELOG.md` plus this file for repository-wide changes).

## 2026.05.13

**Build Tools**: Added new locale conversion utility:

- Created `tools/convert-locales.js`: Automatically converts JSON locale files to PO (gettext) format for easier translation management
- Added `locales:convert` script to root `package.json`
