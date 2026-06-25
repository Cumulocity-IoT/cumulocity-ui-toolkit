# Layered Map Widget

Displays a map with position markers for devices that carry a `c8y_Position` fragment. Multiple,
independently configurable layers can be combined on a single map.

## Features

- **Multiple layer types** — Combine inventory, alarm and event layers on one map.
  - **Inventory query layer** — e.g. show all devices with a custom fragment and a given value.
  - **Alarm query layer** — show all devices that match an alarm query.
  - **Event query layer** — show all devices that match an event query.
  - **Asset layer** — pick a DTM asset type to show all managed objects of that type. Only available when the Digital Twin Manager (`dtm`) microservice is installed; the selection prefills a customizable inventory query.
- **Custom markers** — Configure marker icon and color per layer. Alarm layers color markers by the highest active alarm severity.
- **Scalable polling** — Position updates and layer changes are polled using bulk requests, so the widget scales to higher device counts.
- **Viewport-scoped position polling** — Position polling is restricted to the current map viewport (bounding box) and re-evaluated on every tick, so off-screen devices aren't fetched. Zooming out or panning to reveal new area triggers a full resync of that area; zooming in is skipped. Disabled by default — enable it only for devices that actually move.
- **Query preview** — In the configuration panel, each layer's query is shown as a tokenized, color-coded clause rail (with a raw-string toggle) instead of raw JSON.
- **Configurable map bounds** — Auto-fit to all markers, or set center and zoom level manually (with geocoding and current-location helpers).
- **Device popover** — Configurable per layer: last-update date, alarm details, latest measurement values (`c8y_LatestMeasurements`), asset properties (asset layers only) and custom actions are shown in the marker popover.

## Widget configuration

Open the configuration panel to:

1. **Auto-Center** — Fit all markers automatically, or set zoom level and center manually.
2. **Zoom level / Center bound** — Manual map bounds (enabled when Auto-Center is off).
3. **Position Polling** — Enable/disable automatic position polling and configure the interval. Disabled by default; enable it only when devices actually move (stationary devices don't need it). When enabled, polling is scoped to the visible map area.
4. **Layers** — Add, edit and remove layers and configure their markers and popovers. Available layer types are inventory, alarm, event and — when the `dtm` microservice is installed — asset layers (pick an asset type to prefill a customizable inventory query). Each layer's query is previewed in the list.

## Module

`LayeredMapWidgetPluginProviders` — exported from `./src/app/widget/layered-map/layered-map-widget.module.ts`

## Key internals

| Symbol | Purpose |
|---|---|
| `LayeredMapWidgetComponent` | Main widget — renders the Leaflet map and layers |
| `LayeredMapWidgetConfig` | Configuration component |
| `LayerModalComponent` | Create/edit a single layer |
| `PopupComponent` | Marker popover (dynamically created per marker) |

### Layered Map Widget — position polling is intentionally global

The layered map widget polls device **position updates** with a single, widget-wide
subscription (`LayeredMapWidgetComponent.createPositionUpdatePolling` →
`PositionPollingService.createPolling$('has(c8y_Position)', interval)`), **not** one poll
per layer. This is deliberate:

- It is a **delta query** (`has(c8y_Position) and lastUpdated.date gt '<lastSeen>'`), so the
  server returns only devices that actually moved since the last tick. Stationary devices
  cost nothing on the response side.
- A single query is then **distributed** to all active layers client-side
  (`onPositionUpdate` matches each returned MO against `layer.devices`). Splitting it into
  per-layer polls would issue **N redundant `has(c8y_Position)` inventory queries** every
  tick (one per layer) for no benefit — every layer would still hit the same global
  position dataset.

So the per-layer config controls **query/membership polling** (`enablePolling` /
`pollingInterval` — re-running each layer's alarm/inventory/event query), while position
polling stays a **shared global** concern (`config.positionPolling`). It defaults to
**disabled** because only dashboards with genuinely moving devices need it. A per-layer
position-polling model was prototyped and reverted for the N-queries reason above; do not
reintroduce it without first making the poll a single shared query keyed by interval.

#### Viewport scoping (bounding box) and resync

The position poll is **scoped to the current map viewport**. `buildPositionFilter()`
appends a `c8y_Position.lat/lng` bounding box (derived from `map.getBounds()`) to the
query, and `createPolling$` re-evaluates that filter on **every tick**, so panning/zooming
automatically re-scopes the next poll. Devices that move while off-screen are not fetched.
The whole-world view (or a longitude wrap, `west >= east`) drops the longitude clause so
nothing is missed.

Because the periodic poll is a **delta** (`lastUpdated gt cursor`) and the cursor advances
from whatever is *in view*, a device that moves while off-screen can have its update
"skipped" (the cursor jumps past it). So revealing new area must trigger a **full
(non-delta) resync** of the new viewport — `PositionPollingService.fetchOnce()` — to bring
those markers up to date. The resync trigger is a debounced `moveend` gated on
`lastPolledBounds.contains(newBounds)`:

- **Zoom in** → new bounds ⊆ last → `contains` true → **skip** (no new area).
- **Zoom out / pan** → new bounds ⊄ last → **resync** and update `lastPolledBounds`.

Note this is **scope A**: markers are still all loaded up front by each layer's full query
(`LayerService.load`), so the bounding box only trims *position-update* traffic and the
resync only refreshes *positions*. It does **not** lazy-load markers by viewport (that
would be a larger rework — alarm/event layers resolve devices via `alarm.source`, which a
position bbox can't filter directly).

### Layered Map Widget — DTM asset layer

The "Assets" layer type is a thin wrapper over a regular **inventory** query layer, not a new
layer kind. Picking a DTM asset type prefills `filter = { type: '<identifier>' }` and stores the
chosen `assetType` on the `QueryLayerConfig` (so the picker can be restored on edit); polling and
rendering reuse the existing inventory query path unchanged. Switching the query tab away from
Inventory clears the asset origin.

Asset types come from `DtmService` (`packages/shared`, extends `MicroserviceService`) hitting
`service/dtm/definitions/assets`. The "Assets" option is gated behind
`ApplicationAvailabilityService.isAvailable('dtm')` — a shared, cached check (by app name or
context path) for whether a microservice is installed. Reuse that service for any other
optional-microservice gating rather than re-querying `ApplicationService` ad hoc.
