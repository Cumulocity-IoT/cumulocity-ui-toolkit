# Asset Navigator Plugin Changelog

## 1.0.0

### Features

- **Asset tree navigator**: a *Tree* entry in the navigator opens an explorer drawer with the full asset hierarchy over the current page — fully expanded by default, filterable, pinnable and resizable, with rolled-up status dots (worst alarm severity, availability), a path header for the selected asset and a hover detail panel
- **Global asset search**: a header search button and the `⌘K` / `Ctrl+K` shortcut open a search palette over all assets and devices of the tenant — fuzzy matching, filter chips, recent entries and keyboard navigation

### Bug Fixes (compared to the windy original)

- Search palette no longer closes by itself when the shell changes the URL right after load (e.g. cockpit's global-context query params)
- The pinned star now shows on tree rows of pinned assets

### Notes

- Ported from the windy solution's `asset-navigator` and `global-search` plugins (Web SDK 1024.21.x); the former `⌘K` overlay export, retired there, is not included
- Reads the windy data model fragments (`wnd_Status`, `wnd_PowerCurve`, `wnd_OperatingState`, `wnd_NextService`, `wnd_Owner`) for status and detail values where present
