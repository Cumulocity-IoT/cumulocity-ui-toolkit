# Asset Navigator Plugin

Fast navigation for large asset hierarchies: an asset tree in the navigator that opens an explorer drawer over
any page, and a tenant-wide search palette for assets and devices.

The plugin has two exports that can be installed independently:

| Export | Module | What it adds |
|---|---|---|
| Asset tree navigator | `assetTreeNavigatorViewProviders` | *Tree* entry in the navigator + explorer drawer |
| Global asset search | `globalSearchViewProviders` | Header search button + `⌘K` / `Ctrl+K` palette |

## Asset tree navigator

- **Tree (navigator entry)** — sits next to the platform's *Groups* entry (whether *Groups* shows stays the
  tenant's choice). It does not navigate: clicking it slides out the **explorer drawer** over the current
  page — 400px wide by default, drag-resizable from 280 to 720px, and pinnable (pinned it pushes the page
  content, unpinned it overlays and closes on an outside click). Width and pin state are remembered per user.
- The hierarchy starts **fully expanded**; collapsed branches stay collapsed. The two buttons on the
  `HIERARCHY` row expand or collapse everything (disabled while a filter is active).
- Row icons come from the platform's asset API, so custom icons per asset type show up here too.
- Every row carries a rolled-up **status dot**: colour = worst active alarm severity in the subtree,
  shape = availability (a hollow ring means something below is not producing).
- Branch rows show how many devices they contain; there is no "load more" anywhere in the tree.
- Hovering a row opens a **detail panel** next to the drawer (status, power, wind speed, availability,
  alarms, health, optional 24-hour power sparkline). The ⚙ chooses which fields appear, per user.
- **★ Pinned & Recent** sits above the hierarchy. Pinning an asset creates a Cumulocity bookmark, so it
  also appears in the platform's bookmark list.
- Fully keyboard operable: arrows move and expand, `Enter` opens, `Alt`+`Enter` opens in a new tab, typing
  goes to the filter, `Esc` closes the innermost panel and then the drawer.

### Options menu

The cog next to the drawer's pin opens the tree options, stored per user and applied at once:

| Option | Default |
|---|---|
| Show search | on |
| Show Pinned & Recent | on |
| Pinned items shown / Recent items shown | 10 / 8 (1–25) |
| Keyboard shortcut to open the tree | none — click the field and press a chord with a modifier, e.g. Alt+Shift+T |
| Inventory fallback without DTM | on — without the Digital Twin Manager, search asset properties and type filters come from the inventory |

Platform users keep them on their user object (`customProperties.ps_AssetNavigatorSettings`). Single sign-on users
(`customProperties.userOrigin = OAUTH2`), and users who may not update themselves, get a managed object of type
`ps_AssetNavigatorSettings` owned by them instead.

## Global asset search

- A search button in the header and the `⌘K` / `Ctrl+K` shortcut open the **search palette**.
- Typo-tolerant search over all assets and devices of the tenant, with filter chips (e.g. by type or by
  parent asset), recent entries and keyboard navigation; `Enter` opens the selected result.

## Data

Everything comes from one asset-store sweep of the hierarchy. The sweep starts as soon as the plugin loads,
so the drawer and the palette render from cache instead of showing a spinner. It refreshes every 5 minutes
in the background, every 30 seconds while the drawer is open, and pauses while the browser tab is hidden.
The tree itself issues no requests; only the detail panel fetches, and only on a committed hover.

Status and detail values use the windy data model fragments (`wnd_Status`, `wnd_PowerCurve`,
`wnd_OperatingState`, `wnd_NextService`, `wnd_Owner`) where present; assets without them still show in the
tree and the search, with alarm-based status only.

## Development

```bash
pnpm run build:asset-navigator        # build the plugin ZIP
pnpm run test:asset-navigator         # unit tests (Karma + Jasmine)
pnpm run e2e:mock asset-navigator     # e2e against the tenant mock (see test/AGENTS.md)
```

Ported from the windy solution's `asset-navigator` and `global-search` plugins. The code still compiles
with `strictNullChecks: false` (see `tsconfig.app.json`), as it did there.
