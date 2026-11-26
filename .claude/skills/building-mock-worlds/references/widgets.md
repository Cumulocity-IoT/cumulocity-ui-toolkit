# Widget configs that render

Verified against `@c8y/ngx-components` 1024 and checked in the cockpit on the mock. `componentId` is the widget's
id, not its display name. `DP` is a data point, `TIME` a time block (both below).

## Shared pieces

**Data point (`DP`)** — every data point widget needs `fragment`, `series`, `__active: true` and
`__target: { id, name }`:

```json
{ "__active": true, "__target": { "id": "2001", "name": "Pump 01" }, "fragment": "c8y_Temperature", "series": "T",
  "unit": "C", "label": "Temperature", "color": "#1776BF",
  "min": 0, "max": 100, "yellowRangeMin": 70, "yellowRangeMax": 80, "redRangeMin": 80, "redRangeMax": 100, "target": 60 }
```
Ranges are numbers (not strings). Graph-only: `renderType` (`avg` | `min` | `max` | `area`), `lineType` (`line`,
`dashed`, `dotted`, `points`, `linePoints`, `bars`, `step-before`, `step-after` — never `null`), `yAxisType`
(`left` | `right`).

**Device reference** — alarm, event, map, asset table and HTML widgets: `"device": { "id": "1001", "name": "Plant North" }`.
A group includes its children (`showAlarmsForChildren`, `showEventsForChildren`, default true).

**Time blocks (`TIME`)** — without one, the graph, table, alarm list and event list show **only the last hour**:

```jsonc
// last 24 h, moving with the clock
{ "displayMode": "config", "refreshOption": "live", "isAutoRefreshEnabled": true, "refreshInterval": 5000, "aggregation": null,
  "dateTimeContext": { "dateFrom": "<now - 1d>", "dateTo": "<now>", "interval": "days" } }
// all time
{ "displayMode": "config", "refreshOption": "live", "isAutoRefreshEnabled": true, "refreshInterval": 5000, "aggregation": null,
  "dateTimeContext": { "dateFrom": "1970-01-01T00:00:00.000Z", "dateTo": "<now>", "interval": "none" } }
```
`interval`: `minutes`, `hours`, `days`, `weeks`, `months` (re-anchored to the clock in live mode), `custom` (fixed
`dateFrom`), `none` (all time). `displayMode`: `config` (widget owns the range), `view_and_config` (plus inline
picker), `dashboard` (follows the dashboard's time bar).

## Widgets

### `kpi.widget` — one value
```json
{ "datapoints": [DP], "showTimestamp": true, "numberOfDecimalPlaces": 1, "icon": "thermometer", "showIcon": true,
  "displayMode": "config", "refreshOption": "live", "isAutoRefreshEnabled": true }
```
Live shows the latest value regardless of range; colors from the DP's yellow/red ranges.

### `Data points graph` — line chart
```json
{ "datapoints": [DP, DP], "yAxisSplitLines": true, …TIME }
```
Needs the feature `ui.datapoint-graph.v2` (on by default in the mock); without it the legacy chart renders.

### `KPI List` — latest value per data point
```json
{ "datapoints": [DP, DP, DP], "decimalPlaces": 2 }
```
Without a time block it shows the latest value of all time (legacy default) — usually what you want.

### `Data points table`
```json
{ "datapoints": [DP + "renderType": "avg"], "decimalPlaces": 2, …TIME }
```

### `KPI Radial Gauge` and `infoGauge`
```json
{ "datapointsGauge": [DP], "datapoints": [DP], "fractionSize": 1 }
```
Latest value; the arc uses the DP's `min`/`max` (default 0/100). `infoGauge` also takes `datapointsLabels: [DP, …]`.

### `KPI Linear Gauge` (`KPI Silo` = vertical legacy id)
```json
{ "datapoints": [DP], "fractionSize": 1, "orientation": "horizontal" }
```
`datapoints` is required — the widget crashes without it.

### `Alarm list`
```json
{ "device": { "id": "1001", "name": "Plant North" }, "widgetId": "Alarm list", "showAlarmsForChildren": true,
  "severities": { "CRITICAL": true, "MAJOR": true, "MINOR": true, "WARNING": true },
  "status": { "ACTIVE": true, "ACKNOWLEDGED": true, "CLEARED": false },
  "types": [""], "order": "BY_ACTIVE", …TIME(all time) }
```
`order`: `BY_ACTIVE`, `BY_SEVERITY`, `BY_DATE_ASCENDING`, `BY_DATE_DESCENDING`. `Recent Alarms` and `Asset Alarms`
override severities/status with presets (all / CRITICAL+ACTIVE); for own filters use `Alarm list`.

### `Event list`
```json
{ "device": { "id": "2001", "name": "Pump 01" }, "type": "acme_Maintenance", …TIME(all time) }
```
Without a time block it follows the dashboard time bar (last hour).

### `Map`
```json
{ "device": { "id": "1001", "name": "Plant North" }, "mapConfig": { "center": [51.226, 6.773], "zoomLevel": 14, "autoFitToBounds": true }, "realtime": false }
```
Markers: the object and its children with `c8y_Position`.

### `markdown`
```json
{ "markdownContent": "# Title\n\nText", "markdownBinaryId": null, "contentUrl": null }
```
The text key is `markdownContent` (not `content`).

### `Html widget`
```json
{ "device": { "id": "2001", "name": "Pump 01" },
  "config": { "code": "<h3>${this.c8yContext?.name}</h3>", "css": "", "legacy": false, "devMode": false,
              "options": { "cssEncapsulation": false, "advancedSecurity": false } } }
```
`code` is a Lit template body: `${this.c8yContext…}` works, backticks do not. `options` is required.

### `Image`
```json
{ "imageBinaryId": "5001", "styling": { "objectFit": "contain" } }
```
An inventory binary of the world (`binaries`); URLs are not supported.

### `Asset table`
```json
{ "device": { "id": "1001", "name": "Plant North" }, "isDeviceAssetSelected": false,
  "selectedProperties": [
    { "name": "name", "label": "Name", "keyPath": ["name"], "visible": true },
    { "name": "c8y_ActiveAlarmsStatus", "label": "Alarms", "visible": true }
  ], "operationColumns": [], "showAsLink": true, "showStatusIcon": true }
```
`isDeviceAssetSelected: false` lists the group's members; `true` shows the object itself.

### `Quick Links`
```json
{ "links": [{ "label": "Devices", "url": "#/device", "icon": "exchange", "newTab": false }], "displayOption": "Grid", "translateLinkLabels": false }
```
`Applications` and `HelpAndService` with `{}` fill their own links.

## Unknown widget?

Configure it once in the cockpit on the mock (dashboard → Edit widgets → add), then
`pnpm exec c8y-ui world export` and copy its `config`. That is the shape the widget writes, so it is the shape it reads.
