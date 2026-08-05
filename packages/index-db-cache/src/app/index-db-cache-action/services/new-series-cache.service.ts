import { Injectable } from '@angular/core';
import { AggregatedISeries } from './chart-data.service';
import { COVERAGE_TTL_MS, asError } from './interceptor-helpers';

// ─── DB constants ────────────────────────────────────────────────────────────

const DB_NAME = 'fancy-graph-measurements';
// Bump to 3: AggKey now folds in the aggregationFunction set, and stat
// fields are stored only when the API actually returned them (v2 fabricated
// avg as the min/max midpoint, which poisoned aggregationFunction requests).
const DB_VERSION = 3;
const STORE_DATA = 'measurements';
const STORE_COVERAGE = 'coverage';

// ─── Internal types ───────────────────────────────────────────────────────────

/**
 * The cache-bucket granularity key: the `aggregationInterval` request value
 * (e.g. `"12h"`, `"1d"`), suffixed with the sorted `aggregationFunction` set
 * when one was requested (e.g. `"12h|avg,sum"`). Different intervals or
 * function sets return different data and must never collide.
 */
export type AggKey = string;

interface MeasurementEntry {
  deviceId: string;
  series: string;
  aggKey: AggKey;
  /** ISO 8601 timestamp — the bucket key Cumulocity uses in the series response. */
  ts: string;
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
  count?: number;
  stdDevPop?: number;
  stdDevSamp?: number;
}

interface CoverageRecord {
  deviceId: string;
  series: string;
  aggKey: AggKey;
  /** ISO 8601 start of the fully-fetched interval. */
  from: string;
  /** ISO 8601 end of the fully-fetched interval. */
  to: string;
  /**
   * Epoch ms when this record was written. Records older than
   * `COVERAGE_TTL_MS` (and legacy records without the field) are treated as
   * uncovered and deleted lazily by `getCoverage`, so deletions and backdated
   * measurements are picked up after at most one TTL period.
   */
  storedAt?: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Persists Cumulocity measurement series in IndexedDB so repeated requests for
 * overlapping date ranges only fetch the uncached gaps from the API.
 *
 * **Why IndexedDB?**
 * - `localStorage`/`sessionStorage`: synchronous, string-only, hard 5 MB cap.
 * - `Cache API`: designed for HTTP responses; no structured range queries.
 * - **IndexedDB**: async, multi-GB capacity, native structured objects, compound-
 *   key range scans — ideal for time-series indexed by device + series + time.
 *
 * Provided at root so that a single database instance is shared across all
 * widget instances in the same browser tab.
 */
@Injectable({ providedIn: 'root' })
export class NewSeriesCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  // ─── Cache reads ─────────────────────────────────────────────────────────────

  /**
   * Returns all cached data points for the given (deviceId, series, interval)
   * key within [dateFrom, dateTo], shaped as {@link AggregatedISeries}.
   */
  async getRange(
    deviceId: string,
    series: string,
    agg: AggKey,
    dateFrom: Date,
    dateTo: Date
  ): Promise<AggregatedISeries> {
    const db = await this.openDb();
    const store = db.transaction(STORE_DATA, 'readonly').objectStore(STORE_DATA);
    const range = IDBKeyRange.bound(
      [deviceId, series, agg, dateFrom.toISOString()],
      [deviceId, series, agg, dateTo.toISOString()]
    );

    return new Promise<AggregatedISeries>((resolve, reject) => {
      const values: AggregatedISeries['values'] = {};
      const req = store.openCursor(range);

      req.onsuccess = () => {
        const cursor = req.result;

        if (cursor) {
          const entry = cursor.value as MeasurementEntry;

          values[entry.ts] = [
            {
              min: entry.min,
              max: entry.max,
              avg: entry.avg,
              sum: entry.sum,
              count: entry.count,
              stdDevPop: entry.stdDevPop,
              stdDevSamp: entry.stdDevSamp,
            },
          ];
          cursor.continue();
        } else {
          resolve({ values });
        }
      };
      req.onerror = () => reject(asError(req.error, 'IndexedDB request failed'));
    });
  }

  /** Returns the list of fully-fetched intervals for a (deviceId, series, interval) key. */
  async getCoverage(
    deviceId: string,
    series: string,
    agg: AggKey
  ): Promise<{ from: string; to: string }[]> {
    const db = await this.openDb();
    // readwrite: expired records are deleted lazily while scanning
    const store = db.transaction(STORE_COVERAGE, 'readwrite').objectStore(STORE_COVERAGE);
    // '' sorts before any ISO date; '\uffff' sorts after — bounds all 'from' values
    // for the given (deviceId, series, agg) prefix without a secondary index.
    const range = IDBKeyRange.bound([deviceId, series, agg, ''], [deviceId, series, agg, '\uffff']);

    const expiryLimit = Date.now() - COVERAGE_TTL_MS;

    return new Promise<{ from: string; to: string }[]>((resolve, reject) => {
      const records: { from: string; to: string }[] = [];
      const req = store.openCursor(range);

      req.onsuccess = () => {
        const cursor = req.result;

        if (cursor) {
          const rec = cursor.value as CoverageRecord;

          // Expired (or legacy, pre-TTL) records no longer count as covered —
          // the window is refetched once and re-covered with a fresh stamp.
          if (rec.storedAt && rec.storedAt > expiryLimit) {
            records.push({ from: rec.from, to: rec.to });
          } else {
            cursor.delete();
          }
          cursor.continue();
        } else {
          resolve(records);
        }
      };
      req.onerror = () => reject(asError(req.error, 'IndexedDB request failed'));
    });
  }

  // ─── Gap detection ───────────────────────────────────────────────────────────

  /**
   * Pure function — given the known covered intervals and the requested window,
   * returns the sub-intervals NOT yet in cache that must be fetched from the API.
   *
   * 1. Filter coverage to records overlapping [dateFrom, dateTo].
   * 2. Merge overlapping/adjacent intervals.
   * 3. Walk the merged list and emit uncovered spans.
   */
  computeGaps(
    coverage: { from: string; to: string }[],
    dateFrom: Date,
    dateTo: Date
  ): { from: Date; to: Date }[] {
    const reqFrom = dateFrom.toISOString();
    const reqTo = dateTo.toISOString();

    const overlapping = coverage
      .filter((c) => c.to > reqFrom && c.from < reqTo)
      .sort((a, b) => a.from.localeCompare(b.from));

    const merged: { from: string; to: string }[] = [];

    for (const rec of overlapping) {
      if (!merged.length || rec.from > merged[merged.length - 1].to) {
        merged.push({ from: rec.from, to: rec.to });
      } else if (rec.to > merged[merged.length - 1].to) {
        merged[merged.length - 1].to = rec.to;
      }
    }

    const gaps: { from: Date; to: Date }[] = [];
    let cursor = reqFrom;

    for (const interval of merged) {
      if (cursor < interval.from) {
        gaps.push({ from: new Date(cursor), to: new Date(interval.from) });
      }

      if (interval.to > cursor) {
        cursor = interval.to;
      }
    }

    if (cursor < reqTo) {
      gaps.push({ from: new Date(cursor), to: dateTo });
    }

    return gaps;
  }

  // ─── Cache writes ─────────────────────────────────────────────────────────────

  /**
   * Persists all data points from `data` and records a coverage entry for the
   * fetched interval in a single IndexedDB transaction.
   */
  async storeRange(
    deviceId: string,
    series: string,
    agg: AggKey,
    dateFrom: Date,
    dateTo: Date,
    data: AggregatedISeries
  ): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction([STORE_DATA, STORE_COVERAGE], 'readwrite');
    const dataStore = tx.objectStore(STORE_DATA);
    const coverageStore = tx.objectStore(STORE_COVERAGE);

    for (const [ts, entries] of Object.entries(data.values)) {
      const entry = entries[0];

      if (!entry) continue;
      dataStore.put({
        deviceId,
        series,
        aggKey: agg,
        ts,
        // Store only what the API returned — fabricating absent stats (e.g.
        // avg from the min/max midpoint) would serve invented data to future
        // requests for those aggregation functions.
        min: entry.min,
        max: entry.max,
        avg: entry.avg,
        sum: entry.sum,
        count: entry.count,
        stdDevPop: entry.stdDevPop,
        stdDevSamp: entry.stdDevSamp,
      } satisfies MeasurementEntry);
    }

    coverageStore.put({
      deviceId,
      series,
      aggKey: agg,
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
      storedAt: Date.now(),
    } satisfies CoverageRecord);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(asError(tx.error, 'IndexedDB transaction failed'));
    });
  }

  // ─── Cache management ─────────────────────────────────────────────────────────

  /**
   * Returns the total number of cached measurement entries and an estimated
   * storage size in MB (using the Storage API's origin-level estimate).
   */
  async getStats(): Promise<{ elementCount: number; storageSizeMB: number }> {
    const db = await this.openDb();

    const elementCount = await new Promise<number>((resolve, reject) => {
      const req = db.transaction(STORE_DATA, 'readonly').objectStore(STORE_DATA).count();

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(asError(req.error, 'IndexedDB request failed'));
    });

    let storageSizeMB = 0;

    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();

        storageSizeMB = (estimate.usage ?? 0) / (1024 * 1024);
      }
    } catch {
      /* unavailable in some contexts */
    }

    return { elementCount, storageSizeMB };
  }

  /**
   * Removes all data and coverage entries from the cache for the given
   * `deviceId` and `seriesKeys` (each in `"fragment.series"` form), matching
   * the keys used by {@link storeRange}.
   */
  /** Removes every entry from both IndexedDB stores (data + coverage). */
  clearAll(): Promise<void> {
    return this.openDb().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_DATA, STORE_COVERAGE], 'readwrite');

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(asError(tx.error, 'IndexedDB transaction failed'));
          tx.objectStore(STORE_DATA).clear();
          tx.objectStore(STORE_COVERAGE).clear();
        })
    );
  }

  clearForDatapoints(deviceId: string, seriesKeys: string[]): Promise<void> {
    if (!seriesKeys.length) return Promise.resolve();

    return this.openDb().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_DATA, STORE_COVERAGE], 'readwrite');

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(asError(tx.error, 'IndexedDB transaction failed'));

          const dataStore = tx.objectStore(STORE_DATA);
          const coverageStore = tx.objectStore(STORE_COVERAGE);

          const deleteAll = (store: IDBObjectStore, series: string) => {
            const range = IDBKeyRange.bound(
              [deviceId, series, '', ''],
              [deviceId, series, '\uffff', '\uffff']
            );
            const req = store.openCursor(range);

            req.onsuccess = () => {
              const cursor = req.result;

              if (cursor) {
                cursor.delete();
                cursor.continue();
              }
            };
          };

          for (const series of seriesKeys) {
            deleteAll(dataStore, series);
            deleteAll(coverageStore, series);
          }
        })
    );
  }

  // ─── DB lifecycle ─────────────────────────────────────────────────────────────

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise != null) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Upgrade path: drop and recreate stores when the version changes so
        // stale entries with the old schema (fabricated avg, un-suffixed
        // AggKey) do not pollute the new structure.
        if (event.oldVersion < 3) {
          if (db.objectStoreNames.contains(STORE_DATA)) db.deleteObjectStore(STORE_DATA);
          if (db.objectStoreNames.contains(STORE_COVERAGE)) db.deleteObjectStore(STORE_COVERAGE);
        }
        db.createObjectStore(STORE_DATA, { keyPath: ['deviceId', 'series', 'aggKey', 'ts'] });
        db.createObjectStore(STORE_COVERAGE, { keyPath: ['deviceId', 'series', 'aggKey', 'from'] });
      };

      req.onsuccess = () => resolve(req.result);

      req.onerror = () => {
        // If IndexedDB is unavailable (private browsing, CSP, etc.) callers
        // receive the rejection and can fall back to a direct API fetch.
        this.dbPromise = null;
        reject(asError(req.error, 'IndexedDB request failed'));
      };
    });

    return this.dbPromise;
  }
}
