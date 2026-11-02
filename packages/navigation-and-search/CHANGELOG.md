# Navigation and Search Plugin Changelog

## 1.3.0

### Features

- **Settings drawer**: the cog in the explorer drawer opens the settings as a bottom drawer instead of a dropdown, with the tabs *General* (the former options menu, plus the global search shortcut shown read-only), *By level* and *Tree filter*.
- **Detail fields by level** ("By level" tab): every asset type of the hierarchy the tree shows, one row per level, with the field editor next to a live preview of the hover panel for an asset of that type. Replaces the detail panel's ⚙ and the "Detail fields…" modal, which are removed.
- **Configurable rollups** per level ("By level" tab): what a group summarises about its subtree and which value is its row badge — counts of assets or devices (optionally of a type), availability, active alarms or alarmed units of chosen severities, and the sum, average, minimum or maximum of a numeric asset property (DTM attributes included) or of a latest measurement. Computed from the cached tree, no request per asset; latest values come with the existing inventory requests (`withLatestValues`) only while a measurement rollup is configured. The status dot's severities are configurable too.
- **Tree filter** tab: conditions that always narrow the tree — a property of a level's assets, active alarms of at least a severity in their subtree, or an unavailable device below them; emptied groups are hidden too. A bar above the tree says how many assets are hidden and turns the filter off. Search, expand-all, footer counts and rollups follow the filtered tree; the global search does not.
- The settings cog moved to the bottom right of the tree drawer; the settings tabs have icons.
- **Add asset properties** uses the platform's asset property list (`c8y-asset-property-list`) in a stacked bottom drawer: keys, current values, nested fragments and a filter. It lists the DTM-modelled properties together with the asset's own fragments, so it also works without the Digital Twin Manager. Replaces the plugin's own inventory field picker.

### Breaking Changes

- Renamed from *Asset Navigator* to *Navigation and Search*: package `packages/navigation-and-search`, npm name and ZIP `cumulocity-navigation-and-search-plugin`, `data-cy` prefix `navigation-and-search--`. The context path, the plugin key, the module names and the stored settings (`ps_AssetNavigatorSettings`) are unchanged, so installed tenants update in place and keep their settings.

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

### Bug Fixes

- Large tenants (high-volume mode): branches loading at the same time all appear (only the last one did); every way of opening a branch loads its children; "load more" pages survive a refresh; pins in unloaded branches are no longer shown as deleted.
- "Search the whole tenant" from the tree hands its term to the search; repeating a search no longer leaves the spinner on; opening a result does not wait for, or depend on, saving it as recent.
- Search results follow the tree's poll (names, status, alarm chips); a failed size probe or first sweep no longer degrades search for the session.
- The detail panel's latest values are refreshed after 30 s instead of once per session.
- Options menu changes are saved in order, create one settings object, and are not overwritten by the initial read.
- ⌘K leaves the keys to the drawer when the drawer is bound to them, is ignored while a shortcut is recorded, and is not swallowed on pages without the search.

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
