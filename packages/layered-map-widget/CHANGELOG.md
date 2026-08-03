# Layered Map Widget Changelog

## 7.0.0 — 2026-06-23

### Features

- **DTM asset layer**: Added a new "Assets" layer type that lists all DTM asset types in a dropdown. Selecting an asset type prefills a regular, fully customizable inventory query (`type eq '<assetType>'`) and polls managed objects of that type.
  - The option is only shown when the Digital Twin Manager (`dtm`) microservice is installed in the tenant.
  - The chosen asset type is persisted on the layer config (`QueryLayerConfig.assetType`) so the picker is restored on edit; switching the query tab away from Inventory clears the asset origin.
- **Query visualization in view mode**: The collapsed layer view now renders the layer's query with the shared `ps-query-display` component (tokenized, color-coded rail with a raw-string toggle) instead of raw JSON.
- **Viewport-scoped position polling**: Position polling is now restricted to the current map viewport (bounding box) and re-evaluated each tick, so off-screen movers are not fetched.
- **Position polling info note**: Added guidance in the configuration panel recommending position polling stays disabled for stationary devices.
- **Popover: latest values**: New popover-config toggle to display the device's latest measurement values (`c8y_LatestMeasurements` fragment; requires the tenant "latest value" feature).
- **Popover: asset properties**: New popover-config section (asset layers only) to display asset properties. The asset type's defined properties (from the DTM asset definition) are suggested; property paths can also be added manually.

### Changes

- Position polling is now **disabled by default**; enable it only when devices actually move.
- On zoom-out/pan that reveals previously unloaded area, a full (non-delta) resync of the new viewport runs (debounced `moveend`, gated on `LatLngBounds.contains`). Zooming in is skipped. Position polling remains a single shared global poll (see `AGENTS.md` for rationale).

### Fixes

- **Popup memory/CD leak**: Marker popup components created per marker are now destroyed and detached from the `ApplicationRef` change-detection loop when their marker is removed (polling delta, position cleared) and when the widget is torn down (`PopUpService.destroyPopup`, `LayerService.tearDown`). Previously they were never freed and kept running change detection.
- **Stale marker on position removal**: When a device loses its `c8y_Position`, its marker is now removed from the map (previously only the cache entry was deleted, leaving the marker visible).
- **Popup layout**: Added a loading indicator while the device loads, truncate long device names, cap popup width (`maxWidth`/`autoPan`), and wrap action buttons instead of overflowing.
