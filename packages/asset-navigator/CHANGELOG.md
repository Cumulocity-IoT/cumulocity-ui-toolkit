# Asset Navigator Plugin Changelog

## 1.2.0

### Features

- **Generic counts**: branch rows and the drawer footer count the assets below them when the Digital Twin Manager is available, and the devices (`c8y_IsDevice`) below them otherwise. The footer tooltips read "x of N devices (assets) have a critical or major alarm" and "x of N devices are unavailable". The sweep now also reads the devices of the hierarchy (they are counted, not drawn), and device alarms roll up into their assets' status dots
- **Availability from the platform**: the status dot's ring and the availability counts come from `c8y_Availability.status` on devices (`AVAILABLE` → available, `UNAVAILABLE` and `MAINTENANCE` → unavailable, missing → unknown and never counted as a fault). An asset that is not a device shows its devices' availability
- **Branch detail rows** are generic: *Devices* (or *Assets* with DTM), *Available x of y*, *Unavailable*, *Alarms*
- **Configurable detail panel (data contract)**: the fields of the hover detail panel are a versioned JSON document (`DetailPanelConfig` — per-type lists plus a default list; sources `property`, `measurement` (latest), `alarms`, `availability`, `lastUpdated`, `type`), described by a JSON Schema shipped with the plugin and documented in the README so it can also be generated. It is stored with the other navigator settings (user or SSO settings object) and validated field by field on read
- **Generic default fields**: *Status, Alarms, Type, Last updated, Model, Serial, Firmware* (`c8y_Hardware`, `c8y_Firmware`)
- **"Detail fields…" in the options menu** opens the field editor for any type present in the tree, or for the default list; the ⚙ in the detail panel edits the hovered asset's type, creating its list from the default on the first change and offering "Reset to default"

### Breaking Changes

- Field selections made before 1.2.0 (user preference `ps.assetNav.detailFields`) are no longer read; the new defaults apply until the fields are configured again
- The 24-hour power sparkline and the wind-farm fields (power, wind speed, rotor speed, health, turbine properties, `wnd_*` fragments) are gone; measurements can be added back per type as `measurement` fields
- The tree root marker is now the external id `c8y_Asset` / `asset-navigator-root` (was `wind-fleet`); without it the first root group is used as before. Without any root group the tree now covers every asset of the tenant instead of a fixed list of wind-farm types
- Availability no longer reads `wnd_Status`, and there is no *derated* state any more

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
