# Index DB Cache Plugin

A Cumulocity IoT plugin that intercepts outgoing HTTP requests to the measurement API and serves historical data directly from the browser's **IndexedDB**, eliminating redundant network round-trips for time-series data that has not changed.

---

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Caches](#caches)
- [Eligibility Criteria](#eligibility-criteria)
- [Cache Control UI](#cache-control-ui)
- [Integration](#integration)
- [Development](#development)

---

## Overview

When a Cumulocity dashboard widget requests historical measurements, the same data is often fetched repeatedly as the user navigates or refreshes. This plugin sits between the Angular frontend and the C8Y API and:

1. Checks whether the requested time window is already stored in IndexedDB.
2. Fetches only the **uncached gaps** from the real API.
3. Merges the cached and freshly-fetched data into a single response — transparent to the caller.

The plugin registers three HTTP interceptors via `ApiService.addInterceptor()`. Each interceptor targets a specific measurement endpoint/parameter combination.

---

## How It Works

### Coverage-gap algorithm

For each incoming request the interceptor:

1. Parses the `source`, `dateFrom`, `dateTo`, and aggregation parameters from the request options.
2. Queries IndexedDB to find which time sub-windows are already stored for that source + series combination.
3. Computes the **gaps** — contiguous windows for which no cached data exists.
4. For each gap, issues a real HTTP sub-request with adjusted `dateFrom`/`dateTo`.
5. Stores the fresh sub-responses back into IndexedDB.
6. Stitches all cached and freshly-fetched data together and resolves the original request with the merged payload.

### Sub-bucket gap skip

If a computed gap is narrower than one aggregation bucket (e.g. the gap is 30 seconds but the bucket size is 1 hour), the interceptor **skips the fetch** for that gap and records a `gap-skipped` log event. This prevents spurious API calls for boundary rounding artefacts.

### Staleness guard

Any request whose `dateTo` is within **5 minutes of now** is treated as potentially live and is passed straight through to the real API without caching.

---

## Caches

| Cache | Endpoint | Distinguishing parameter | Aggregation bucket unit |
|---|---|---|---|
| **New Series** | `/measurement/measurements/series` | `aggregationInterval` (ISO 8601, e.g. `PT1H`, `P1D`) | Parsed from the ISO 8601 duration |
| **Old Series** | `/measurement/measurements/series` | `aggregationType` (`DAILY` / `HOURLY` / `MINUTELY`) | 86 400 000 ms / 3 600 000 ms / 60 000 ms |
| **Measurements** | `/measurement/measurements` | `pageSize ≥ 100` | — (no aggregation) |

Both series caches operate on the same endpoint but target different API generations:
- **New Series** — used by modern C8Y DataPoints widgets that pass `aggregationInterval`.
- **Old Series** — used by legacy widgets that pass `aggregationType`.

---

## Eligibility Criteria

A request is only intercepted when **all** of the following are true.

### New Series
- Path ends with `/measurement/measurements/series`
- `source` param is present
- `dateFrom` and `dateTo` are present and parseable
- At least one `series` param is present
- `aggregationInterval` is present (ISO 8601 duration string)
- `dateTo` is at least **5 minutes** in the past

### Old Series
- Path ends with `/measurement/measurements/series`
- `source`, `dateFrom`, `dateTo` are present
- `aggregationType` is one of `DAILY`, `HOURLY`, or `MINUTELY`
- `aggregationInterval` is **not** present (defers to New Series interceptor)
- `dateFrom` is at least **5 minutes** in the past

### Measurements
- Path ends with `/measurement/measurements`
- `source`, `dateFrom`, `dateTo` are present
- `pageSize` is ≥ 100
- `dateTo` is at least **5 minutes** in the past
- The response body must **not** contain a `next` link (paginated responses fall back to the real API)
- The response body must **not** have `truncated: true`

---

## Cache Control UI

The plugin adds an **action bar button** (database icon) to every Cumulocity view. Clicking it opens a slide-in drawer with three sections.

### Cache Control

A toggle switch that enables or disables all three caches globally. The state is persisted in `localStorage` under the key `c8y-idb-cache-active` and survives page reloads. When disabled, all requests pass straight through to the API.

### Statistics

A per-cache summary table showing:
- Number of entries currently stored in IndexedDB
- Total storage used (MB)
- A **Clear** button to wipe each cache individually

A bandwidth progress bar shows the percentage of total data volume served from the cache vs. fetched from the network since the page loaded.

### Live Log

A scrollable ring-buffer log (last 200 entries) of every intercepted request. Each entry shows:

- **Event type** with a colour-coded icon:
  - `cache-hit` — all data served from IDB (green check)
  - `partial-cache` — some gaps fetched from API (yellow bolt)
  - `gap-skipped` — gap too narrow for a new fetch (grey forward)
  - `passthrough` — request was not eligible for caching (blue cloud)
- The originating cache (`new-series` / `old-series` / `measurement`)
- The requested date range
- The IDB read time in milliseconds
- The number of gaps that required API calls

---

## Integration

`IndexDbCacheModule` is self-contained. Import it into your Cumulocity application module or plugin module:

```typescript
import { IndexDbCacheModule } from './index-db-cache.module';

@NgModule({
  imports: [IndexDbCacheModule],
})
export class AppModule {}
```

The module constructor registers the three interceptors automatically via `ApiService.addInterceptor()`:

| Interceptor key | Interceptor |
|---|---|
| `indexDbCache.newSeries` | `NewSeriesInterceptorService` |
| `indexDbCache.oldSeries` | `OldSeriesInterceptorService` |
| `indexDbCache.measurement` | `MeasurementInterceptorService` |

> **Note:** Starting with Cumulocity 1023, the recommended registration pattern uses `provideAppInitializer`. The commented-out block at the bottom of `index-db-cache.module.ts` shows the future-proof equivalent.

---

## Development

### Prerequisites

- pnpm (`corepack enable && corepack prepare pnpm@latest --activate`)
- A running Cumulocity tenant — set `C8Y_BASEURL` and `C8Y_SHELL_TARGET` in your environment or a local `.env` file.

### Commands

| Purpose | Command |
|---|---|
| Start dev server | `pnpm run serve:index-db-cache` |
| Production build | `pnpm run build:index-db-cache` |
| Run unit tests | `pnpm run test:index-db-cache` |
| Lint | `pnpm run lint` |

The dev server is available at `http://localhost:9001/apps/sag-ps-iot-pkg-index-db-cache-plugin` and proxies API calls to the tenant defined by `C8Y_BASEURL`.
