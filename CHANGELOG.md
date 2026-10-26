# UI Toolkit Changelog

## 2026.10.26

**New plugin**: `packages/events-graph-widget` — device events as colored state bars on a zoomable timeline, moved into the monorepo from PR #34 and ported to Web SDK 1024 / Angular 21. See `packages/events-graph-widget/CHANGELOG.md`.

## 2026.10.23

**New plugin**: `packages/asset-navigator` — asset tree explorer drawer in the navigator and a global asset search (`⌘K` / `Ctrl+K`), ported from the windy solution. See `packages/asset-navigator/CHANGELOG.md`.

**Docs**: `AGENTS.md` now requires changelog entries for every user-facing change (per-plugin `CHANGELOG.md` plus this file for repository-wide changes).

## 2026.05.13

**Build Tools**: Added new locale conversion utility:

- Created `tools/convert-locales.js`: Automatically converts JSON locale files to PO (gettext) format for easier translation management
- Added `locales:convert` script to root `package.json`
