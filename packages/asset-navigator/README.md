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
- Every row carries a rolled-up **status dot**: colour = worst active alarm severity in the subtree (the
  asset's own alarms and those of the devices below it), shape = availability (a hollow ring means a device
  below is unavailable).
- **Counts**: branch rows and the footer count what is below them — **assets** when the Digital Twin Manager
  is available on the tenant, **devices** (`c8y_IsDevice`) otherwise. The footer also shows how many of
  them carry a critical or major alarm and how many devices are unavailable. There is no "load more"
  anywhere in the tree.
- **Availability** comes from the platform's availability monitoring (`c8y_Availability.status` on
  devices): `AVAILABLE` → available, `UNAVAILABLE` and `MAINTENANCE` → unavailable, missing → unknown (never
  counted as a fault). An asset that is not itself a device shows the availability of its devices.
- Hovering a row opens a **detail panel** next to the drawer. A leaf asset shows the fields configured for its
  type — by default *Status, Alarms, Type, Last updated, Model, Serial, Firmware*; a branch always shows its
  counts (*Devices*/*Assets*, *Available x of y*, *Unavailable*, *Alarms*) plus any fields configured for its
  type. The ⚙ in the panel edits the fields of the hovered asset's type; see
  [Detail panel configuration](#detail-panel-configuration-data-contract).
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
| Detail fields… | the detail panel's fields per asset type (or the default list), in the same editor as the panel's ⚙ |

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

The sweep reads every asset (`c8y_IsAsset`) and device (`c8y_IsDevice`) below the root: assets are the tree's
rows, plain devices are attached to the asset that references them and only feed the counts, availability
and alarms. The root is, in this order: the managed object with the external id `c8y_Asset` /
`asset-navigator-root` (give one asset that id to pin the tree to it), the first root group, or — when there
is none — every asset and device of the tenant. Only platform-standard fragments are read
(`c8y_ActiveAlarmsStatus`, `c8y_Availability`, `c8y_Position`, `c8y_Notes`, and whatever the detail panel is
configured to show).

## Detail panel configuration (data contract)

What the hover detail panel shows is a small, versioned JSON document — `DetailPanelConfig` — so it can be
edited in the UI, by hand, or generated (e.g. by an AI assistant) from a description of the data model.

- **Schema:** [`src/app/core/services/settings/detail-panel.schema.json`](src/app/core/services/settings/detail-panel.schema.json)
  (JSON Schema draft 2020-12). TypeScript interface and validator:
  [`detail-panel.model.ts`](src/app/core/services/settings/detail-panel.model.ts).
- **Stored** as `detailPanel` inside the user's asset navigator settings — on the user object
  (`customProperties.ps_AssetNavigatorSettings.detailPanel`), or for SSO users and users who may not update
  themselves in their `ps_AssetNavigatorSettings` managed object (fragment `ps_AssetNavigatorSettings.detailPanel`).
- **Resolution** for the hovered asset: `types[<managed object type>]` if present (an empty list shows no
  fields); otherwise `default` for a leaf asset and nothing for a branch (a branch always shows its counts).
- **Validation** on read: an unknown `version` or an unreadable document gives the defaults; inside a valid
  document malformed fields are dropped one by one (empty label, bad path, unknown source kind, duplicates of
  an earlier field with the same source) and the rest is kept. At most 50 fields per list.

```ts
interface DetailPanelConfig {
  version: 1;
  types: Record<string, DetailField[]>; // by managed-object type
  default: DetailField[];               // every leaf type without its own list
}
interface DetailField {
  label: string;                         // 1–100 characters
  source:
    | { kind: 'property'; path: string }                         // dot path into the managed object
    | { kind: 'measurement'; series: string; fn: 'latest' }      // "<fragment>.<series>", from c8y_LatestMeasurements
    | { kind: 'alarms' }                                         // active alarms of the asset and its subtree
    | { kind: 'availability' }                                   // c8y_Availability in words
    | { kind: 'lastUpdated' }
    | { kind: 'type' };
  unit?: string;                         // appended; measurements fall back to the reading's unit
  format?: 'text' | 'number' | 'percent' | 'date';  // default text (lastUpdated: date)
  precision?: number;                    // 0–6 decimals for number/percent, default 1
}
```

Example — the defaults plus a list for one device type and one for a building group:

```json
{
  "version": 1,
  "default": [
    { "label": "Status", "source": { "kind": "availability" } },
    { "label": "Alarms", "source": { "kind": "alarms" } },
    { "label": "Type", "source": { "kind": "type" } },
    { "label": "Last updated", "source": { "kind": "lastUpdated" }, "format": "date" },
    { "label": "Model", "source": { "kind": "property", "path": "c8y_Hardware.model" } },
    { "label": "Serial", "source": { "kind": "property", "path": "c8y_Hardware.serialNumber" } },
    { "label": "Firmware", "source": { "kind": "property", "path": "c8y_Firmware.version" } }
  ],
  "types": {
    "c8y_Linux": [
      { "label": "Status", "source": { "kind": "availability" } },
      { "label": "CPU temperature", "source": { "kind": "measurement", "series": "c8y_Temperature.T", "fn": "latest" }, "unit": "°C", "format": "number", "precision": 1 },
      { "label": "Revision", "source": { "kind": "property", "path": "c8y_Hardware.revision" } }
    ],
    "building": [
      { "label": "Address", "source": { "kind": "property", "path": "c8y_Address.street" } }
    ]
  }
}
```

`property`, `alarms`, `availability`, `lastUpdated` and `type` are read from the cached inventory without a
request; a list with `measurement` fields costs one `withLatestValues=true` read per hovered asset.

## Development

```bash
pnpm run build:asset-navigator        # build the plugin ZIP
pnpm run test:asset-navigator         # unit tests (Karma + Jasmine)
pnpm run e2e:mock asset-navigator     # e2e against the tenant mock (see test/AGENTS.md)
```

Originally ported from the windy solution's `asset-navigator` and `global-search` plugins; since 1.2.0 it no
longer assumes that data model. The code still compiles with `strictNullChecks: false` (see
`tsconfig.app.json`).
