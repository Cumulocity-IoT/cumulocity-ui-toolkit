# Asset Navigator Plugin Changelog

## 1.1.0

### Features

- **Options menu in the explorer drawer** (cog next to the pin) to configure the asset tree per user:
  - show or hide the search field
  - a keyboard shortcut that opens and closes the drawer (recorded in the menu; none by default)
  - show or hide "Pinned & Recent", and how many pinned and recent items are listed (1–25; defaults 10 and 8)
  - **Inventory fallback without DTM** (on by default): when the Digital Twin Manager is not available, searchable properties are taken from each asset's fragments and the global search offers type filters from the asset types in the tree; off, only DTM definitions are used
  - reset to defaults
- **Settings storage**: on the user (`customProperties.ps_AssetNavigatorSettings`); for single sign-on users — whose user object is managed by the identity provider (`customProperties.userOrigin = OAUTH2`) — and for users who may not update themselves, in a managed object of type `ps_AssetNavigatorSettings` owned by the user

### Bug Fixes

- The global search's shortcut matching ignores unset modifier flags of synthetic key events

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
