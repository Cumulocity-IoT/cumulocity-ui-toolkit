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
- [Design Notes](#design-notes)
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

Requests whose `dateFrom` is within **5 minutes of now** are treated as fully live and passed straight through to the real API. For all other requests, coverage records are **clamped to `now - 5 minutes`**: data near the live edge is served and stored, but never marked as covered, so the next request refetches that window and picks up measurements that arrived (or were backdated) in the meantime.

### Coverage TTL

Every coverage record carries a `storedAt` timestamp and expires after **24 hours** (`COVERAGE_TTL_MS`). Expired records are deleted lazily during gap computation and the window is refetched once and re-covered. This bounds how long deleted or backdated measurements can be served from cache. Data points themselves are kept — only the "fully fetched" marker expires, so the refetch simply overwrites them.

### Bucket alignment & response ordering (verified against a live tenant)

- Aggregation buckets are aligned to an **absolute grid**, not to the request's `dateFrom` — stitching gap sub-requests therefore produces byte-identical results to a single full-window request.
- The API returns the grid bucket **containing** `dateFrom` (its timestamp may lie before `dateFrom`); the cache read window is extended one bucket below `dateFrom` to match.
- The series endpoint returns buckets **oldest first regardless of the `revert` parameter**; synthesized responses do the same.

---

## Caches

| Cache | Endpoint | Distinguishing parameter | Aggregation bucket unit |
|---|---|---|---|
| **New Series** | `/measurement/measurements/series` | `aggregationInterval` (integer + unit, e.g. `12h`, `1d`, `300s`) | Parsed from the interval string |
| **Old Series** | `/measurement/measurements/series` | `aggregationType` (`DAILY` / `HOURLY` / `MINUTELY`) | 86 400 000 ms / 3 600 000 ms / 60 000 ms |
| **Measurements** | `/measurement/measurements` | `pageSize ≥ 100` | — (no aggregation) |

Both series caches operate on the same endpoint but target different API generations:
- **New Series** — used by modern C8Y DataPoints widgets that pass `aggregationInterval`. When `aggregationFunction` params are present (e.g. `avg`, `sum`), the sorted function set is folded into the cache key so responses with different value fields never collide.
- **Old Series** — used by legacy widgets that pass `aggregationType`.

---

## Eligibility Criteria

A request is only intercepted when **all** of the following are true.

### New Series
- Path ends with `/measurement/measurements/series`
- `source` param is present
- `dateFrom` and `dateTo` are present and parseable
- At least one `series` param is present
- `aggregationInterval` is present (integer + unit string, e.g. `12h`; ISO 8601 durations are also accepted)
- `dateFrom` is at least **5 minutes** in the past

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
- `dateFrom` is at least **5 minutes** in the past
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

## Design Notes

Decisions made after auditing the implementation against the C8Y OpenAPI specification and verifying behaviour against a live tenant (2026-08-05).

### Correctness rules the caches follow

1. **`aggregationInterval` format** — the API format is an integer (1–999, no leading zeros) plus a unit letter (`s m h d w M q y`), e.g. `300s`, `12h`, `7d`. The bucket-width parser (`aggregationIntervalMs`) handles this format first and accepts ISO 8601 durations (`PT1H`) as a fallback. Anything unparseable yields `0`, which disables the sub-bucket gap skip but never blocks caching.
2. **`aggregationFunction` partitions the cache** — responses contain only the requested stat fields (verified: `aggregationFunction=max` returns bare `{max}` buckets; the default returns `{min,max}`). The sorted function set is folded into the cache key (`12h|avg,sum`), so different function sets never share entries.
3. **No fabricated statistics** — the caches store exactly the fields the API returned. Absent stats (e.g. `avg` when only min/max were requested) are never synthesized from other fields.
4. **Column mapping follows the response** — `values[ts][i]` corresponds to the response's `series[i]` (`type.name`), not to the order of the request's `series` params. Column keys are derived from the response metadata; request order is only a fallback. Series metadata for fully-cached responses is kept per series key and served only when complete, so `series[i]` always describes column `i`.
5. **Ordering** — the series endpoint returns buckets oldest first **regardless of the `revert` parameter** (verified live); synthesized responses are always emitted in ascending timestamp order.
6. **First bucket** — the API returns the grid bucket *containing* `dateFrom`, whose timestamp may lie before `dateFrom`. The cache read window is extended one bucket below `dateFrom` to match.

### Staleness bounds

- **Live edge (5 min)** — coverage is never recorded closer to `now` than `MIN_HISTORICAL_MS` (see [Staleness guard](#staleness-guard)). New or backdated measurements within 5 minutes of measurement time are always picked up.
- **Coverage TTL (24 h)** — every coverage record expires `COVERAGE_TTL_MS` after it was written (see [Coverage TTL](#coverage-ttl)). Deletions and backdating older than the live edge are picked up after at most one TTL period. This is the only remaining staleness window.

### Live-tenant verification (2026-08-05)

Verified against a production tenant with a `Battery_Percentage` series at `aggregationInterval=12s`:

- Bucket grid is **absolute**, independent of `dateFrom` (`dateFrom=…:32:05` still yields buckets at `:00/:12/:24`; a `7s` interval starts *before* `dateFrom` at the containing bucket).
- **Stitching is exact**: fetching a window as two sub-requests split at an off-grid timestamp and merging produces byte-identical `values` to a single full-window request — the core assumption of the coverage-gap algorithm.
- `revert=true` and `revert=false` return identical (ascending) key order on the series endpoint.

Not yet verified end-to-end: the interceptors running inside a served shell against a live dashboard (`pnpm run serve:index-db-cache`).

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
