import { Injectable } from '@angular/core';
import { AggregatedISeries } from './chart-data.service';

// ─── DB constants ─────────────────────────────────────────────────────────────

const DB_NAME = 'c8y-old-series-cache';
const DB_VERSION = 1;
const STORE_DATA = 'measurements';
const STORE_COVERAGE = 'coverage';

// ─── Internal types ───────────────────────────────────────────────────────────

/**
 * The legacy aggregation type used as the cache-bucket granularity key.
 * Matches the `aggregationType` query parameter of the series endpoint.
 */
export type LegacyAggType = 'DAILY' | 'HOURLY' | 'MINUTELY';

interface MeasurementEntry {
  deviceId: string;
  series: string;
  aggType: LegacyAggType;
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
  aggType: LegacyAggType;
  /** ISO 8601 start of the fully-fetched interval. */
  from: string;
  /** ISO 8601 end of the fully-fetched interval. */
  to: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Persists legacy Cumulocity measurement series (queried via `aggregationType`)
 * in IndexedDB so repeated requests for overlapping date ranges only fetch the
 * uncached gaps from the API.
 *
 * Mirrors {@link NewSeriesCacheService} but uses the `aggregationType` enum
 * (`DAILY | HOURLY | MINUTELY`) as the bucket key instead of an ISO 8601
 * interval string. The two services use separate databases so their data never
 * collides.
 */
@Injectable({ providedIn: 'root' })
export class OldSeriesCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  // ─── Cache reads ─────────────────────────────────────────────────────────────

  async getRange(
    deviceId: string,
    series: string,
    aggType: LegacyAggType,
    dateFrom: Date,
    dateTo: Date
  ): Promise<AggregatedISeries> {
    const db = await this.openDb();
    const store = db.transaction(STORE_DATA, 'readonly').objectStore(STORE_DATA);
    const range = IDBKeyRange.bound(
      [deviceId, series, aggType, dateFrom.toISOString()],
      [deviceId, series, aggType, dateTo.toISOString()]
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
      req.onerror = () => reject(req.error);
    });
  }

  async getCoverage(
    deviceId: string,
    series: string,
    aggType: LegacyAggType
  ): Promise<{ from: string; to: string }[]> {
    const db = await this.openDb();
    const store = db.transaction(STORE_COVERAGE, 'readonly').objectStore(STORE_COVERAGE);
    const range = IDBKeyRange.bound(
      [deviceId, series, aggType, ''],
      [deviceId, series, aggType, '\uffff']
    );

    return new Promise<{ from: string; to: string }[]>((resolve, reject) => {
      const records: { from: string; to: string }[] = [];
      const req = store.openCursor(range);

      req.onsuccess = () => {
        const cursor = req.result;

        if (cursor) {
          const rec = cursor.value as CoverageRecord;

          records.push({ from: rec.from, to: rec.to });
          cursor.continue();
        } else {
          resolve(records);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  // ─── Gap detection ───────────────────────────────────────────────────────────

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

  async storeRange(
    deviceId: string,
    series: string,
    aggType: LegacyAggType,
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
        aggType,
        ts,
        min: entry.min,
        max: entry.max,
        avg:
          entry.avg ??
          (entry.min != null && entry.max != null ? (entry.min + entry.max) * 0.5 : undefined),
        sum: entry.sum,
        count: entry.count,
        stdDevPop: entry.stdDevPop,
        stdDevSamp: entry.stdDevSamp,
      } as MeasurementEntry);
    }

    coverageStore.put({
      deviceId,
      series,
      aggType,
      from: dateFrom.toISOString(),
      to: dateTo.toISOString(),
    } as CoverageRecord);

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // ─── Cache management ─────────────────────────────────────────────────────────

  async getStats(): Promise<{ elementCount: number; storageSizeMB: number }> {
    const db = await this.openDb();
    const elementCount = await new Promise<number>((resolve, reject) => {
      const req = db.transaction(STORE_DATA, 'readonly').objectStore(STORE_DATA).count();

      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
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

  /** Removes every entry from both IndexedDB stores (data + coverage). */
  clearAll(): Promise<void> {
    return this.openDb().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_DATA, STORE_COVERAGE], 'readwrite');

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
          tx.objectStore(STORE_DATA).clear();
          tx.objectStore(STORE_COVERAGE).clear();
        })
    );
  }

  clearForDevice(deviceId: string, seriesKeys: string[]): Promise<void> {
    if (!seriesKeys.length) return Promise.resolve();

    return this.openDb().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_DATA, STORE_COVERAGE], 'readwrite');

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);

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
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        if (!db.objectStoreNames.contains(STORE_DATA)) {
          db.createObjectStore(STORE_DATA, { keyPath: ['deviceId', 'series', 'aggType', 'ts'] });
        }

        if (!db.objectStoreNames.contains(STORE_COVERAGE)) {
          db.createObjectStore(STORE_COVERAGE, {
            keyPath: ['deviceId', 'series', 'aggType', 'from'],
          });
        }
      };

      req.onsuccess = () => resolve(req.result);

      req.onerror = () => {
        this.dbPromise = null;
        reject(req.error);
      };
    });

    return this.dbPromise;
  }
}
