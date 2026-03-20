# Dynamic Aggregation Line Chart

A **Cumulocity IoT dashboard widget** that renders a high-fidelity time-series line chart with full control over aggregation windows and statistical functions — powered by the latest Cumulocity measurement series API.

---

## What this widget does

The widget fetches measurement data from a selected device using the Cumulocity `/measurement/series` endpoint and renders it as an interactive ECharts line chart. It is designed for monitoring scenarios where the queried time range can span seconds to years, and the data must always be presented at the right resolution without overwhelming the browser.

### Dynamic Aggregation Window

> A core feature of this widget is its use of the `aggregationInterval` parameter introduced in the latest Cumulocity series API.

Instead of pulling raw measurements and decimating them client-side, the widget calculates the **optimal aggregation bucket size** for the requested time range on the fly:

- The `AggregationService` iterates through all valid Cumulocity interval strings (`2s`, `1m`, `1h`, `1d`, `1w`, `1M`, …) and picks the **smallest interval that keeps the result set below 5 000 data points**.
- When the user zooms into a sub-range within the chart, a **second, higher-resolution fetch** is issued for that sub-range with a correspondingly smaller interval — giving pixel-perfect detail on the zoomed view without reloading the full dataset.
- The full-range dataset is kept in an **IndexedDB-backed measurement cache** so that pan/zoom interactions are instant after the initial load.

### Configurable Aggregation Functions

The widget exposes the full set of statistical aggregation functions supported by the series API:

| Function | Description |
|---|---|
| `min` | Minimum value in the bucket |
| `max` | Maximum value in the bucket |
| `avg` | Average (time-series persistence only) |
| `sum` | Sum of all samples in the bucket |
| `count` | Number of samples in the bucket |
| `stdDevPop` | Population standard deviation |
| `stdDevSamp` | Sample standard deviation |

Each function is requested as a **separate `aggregationFunction` query parameter** (the API does not accept comma-separated values), and each becomes its own series rendered as a distinct line in the chart. The active functions are fully **configurable per widget instance** in the dashboard configuration panel — defaulting to `min`, `avg`, and `max`.

### Fine-Granular Zoom

When the user zooms into a sub-range of the chart, the widget does not simply rescale what it already has — it issues a **new API request with a finer aggregation interval** calculated specifically for the visible window:

1. The zoom event delivers the new `dateFrom`/`dateTo` to `onZoom()`.
2. `AggregationService.computeAggregationInterval()` is called again for the narrower range, producing a smaller interval (e.g. zooming from 6 months → 6 hours might drop from `1d` down to `5m`).
3. If the new interval differs from the currently active one, a fresh fetch is dispatched.
4. The high-resolution zoom data is **merged back into the full-range baseline**: points inside the zoomed window are replaced by the finer-grained results; points outside remain untouched. This keeps the full chart coherent without a full reload.
5. The statistics sidebar simultaneously updates to show both the overall interval and the zoomed interval side-by-side, so the resolution change is always transparent to the user.

Repeated zooms to the same window are de-duplicated — no redundant requests are fired if the range hasn't changed.

### IndexedDB Measurement Cache

Every API response is written into an **IndexedDB database** (`fancy-graph-measurements`) so that subsequent requests for the same device, series, and aggregation interval never hit the network for data that is already stored locally.

The cache is structured around two object stores:

| Store | Key | Purpose |
|---|---|---|
| `measurements` | `[deviceId, series, aggKey, timestamp]` | Stores individual aggregated data points per bucket |
| `coverage` | `[deviceId, series, aggKey, from]` | Tracks which time intervals have already been fully fetched |

Before every API call, `getCoverage()` is queried to determine which parts of the requested window are already cached. `computeGaps()` then subtracts the covered intervals from the requested range and returns only the **uncovered gaps** that need to be fetched. After fetching, the new data and its coverage record are written back in a single transaction.

**Why IndexedDB (not localStorage or the Cache API)?**
- `localStorage` is synchronous, string-only, and limited to ~5 MB.
- The `Cache API` is designed for HTTP responses and has no support for structured range queries.
- IndexedDB is asynchronous, supports multi-GB storage, stores native JavaScript objects, and allows compound-key range scans — exactly what efficient time-series lookups require.

The cache is provided at the Angular root level, so **a single database instance is shared across all widget instances** in the same browser tab. Cached data survives page refreshes and can be cleared per-datapoint from the widget's cache panel.

### Chart features

- **Zoom & pan** — chart-level zoom triggers a high-resolution re-fetch for the visible sub-range
- **Threshold lines** — configurable horizontal reference lines drawn directly on the chart
- **Statistics sidebar** — shows the active aggregation interval, data-point counts, and date range for both the full view and the current zoom level
- **Global time context** — integrates with the Cockpit global date/time picker
- **Downsampling fallback** — for raw (non-aggregated) series, the Largest-Triangle-Three-Buckets (LTTB) algorithm is applied client-side to reduce visual clutter

---

## Getting started

```bash
npm install
npm start          # dev server proxied to https://demo.wika.io/
npm run build      # production build
npm test           # unit tests (Karma/Jasmine)
```

The widget is registered as a **Module Federation remote** and loads into any Cumulocity Cockpit shell at runtime without a shell rebuild:

```ts
// cumulocity.config.ts
exports: [{ module: 'FancyLineChartGridModule', path: './src/app/widget/dynamic-aggregation-line-chart/ps-line-chart.module.ts' }]
```

Deploy it directly to your tenant:

```bash
npm run deploy
```

---

## Tech stack

- **Angular 18** with `@c8y/ngx-components` (~1021.x)
- **Apache ECharts** via `ngx-echarts`
- **Cumulocity `/measurement/series` API** — `aggregationInterval` + `aggregationFunction` parameters
- **IndexedDB** for client-side measurement caching
- **Module Federation** (`@c8y/devkit`) for plugin packaging
