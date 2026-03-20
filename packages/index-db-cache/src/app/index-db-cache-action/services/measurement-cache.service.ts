import { Injectable } from '@angular/core';
import { CumulocityMeasurement } from './chart-data.service';

// ─── DB constants ─────────────────────────────────────────────────────────────

const DB_NAME = 'c8y-measurement-cache';
const DB_VERSION = 1;
const STORE_DATA = 'measurements';
const STORE_COVERAGE = 'coverage';

// ─── Internal types ───────────────────────────────────────────────────────────

/**
 * A record stored in the data object store. The full measurement JSON is
 * embedded as `raw` so we can reconstruct the original response faithfully.
 */
interface MeasurementEntry {
  /** Managed object ID of the source device. */
  source: string;
  /**
   * `valueFragmentType` filter under which this measurement was fetched,
   * or an empty string when no filter was applied.
   */
  fragmentType: string;
  /**
   * `valueFragmentSeries` filter under which this measurement was fetched,
   * or an empty string when no filter was applied.
   */
  fragmentSeries: string;
  /** ISO 8601 device timestamp — part of the compound key for time-range scans. */
  time: string;
  /** Measurement `id` — disambiguates measurements at the same timestamp. */
  id: string;
  /** Full serialised measurement object, preserved for response reconstruction. */
  raw: string;
}

interface CoverageRecord {
  source: string;
  fragmentType: string;
  fragmentSeries: string;
  /** ISO 8601 start of the fully-fetched interval. */
  from: string;
  /** ISO 8601 end of the fully-fetched interval. */
  to: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Persists raw Cumulocity measurements in IndexedDB keyed by
 * `[source, valueFragmentType, valueFragmentSeries, time, id]` so that
 * repeated range queries only fetch the uncached gaps from the API.
 *
 * The cache is partitioned by `fragmentType` + `fragmentSeries` because the
 * Cumulocity measurement endpoint filters results server-side — data returned
 * for `c8y_Temperature.T` is a different set from `c8y_Humidity.H` and must
 * not be mixed.
 */
@Injectable({ providedIn: 'root' })
export class MeasurementCacheService {
  private dbPromise: Promise<IDBDatabase> | null = null;

  // ─── Cache reads ─────────────────────────────────────────────────────────────

  async getRange(
    source: string,
    fragmentType: string,
    fragmentSeries: string,
    dateFrom: Date,
    dateTo: Date
  ): Promise<CumulocityMeasurement[]> {
    const db = await this.openDb();
    const store = db.transaction(STORE_DATA, 'readonly').objectStore(STORE_DATA);
    const range = IDBKeyRange.bound(
      [source, fragmentType, fragmentSeries, dateFrom.toISOString(), ''],
      [source, fragmentType, fragmentSeries, dateTo.toISOString(), '\uffff']
    );

    return new Promise<CumulocityMeasurement[]>((resolve, reject) => {
      const results: CumulocityMeasurement[] = [];
      const req = store.openCursor(range);

      req.onsuccess = () => {
        const cursor = req.result;

        if (cursor) {
          results.push(JSON.parse((cursor.value as MeasurementEntry).raw) as CumulocityMeasurement);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async getCoverage(
    source: string,
    fragmentType: string,
    fragmentSeries: string
  ): Promise<{ from: string; to: string }[]> {
    const db = await this.openDb();
    const store = db.transaction(STORE_COVERAGE, 'readonly').objectStore(STORE_COVERAGE);
    const range = IDBKeyRange.bound(
      [source, fragmentType, fragmentSeries, ''],
      [source, fragmentType, fragmentSeries, '\uffff']
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
    source: string,
    fragmentType: string,
    fragmentSeries: string,
    dateFrom: Date,
    dateTo: Date,
    measurements: CumulocityMeasurement[]
  ): Promise<void> {
    const db = await this.openDb();
    const tx = db.transaction([STORE_DATA, STORE_COVERAGE], 'readwrite');
    const dataStore = tx.objectStore(STORE_DATA);
    const coverageStore = tx.objectStore(STORE_COVERAGE);

    for (const m of measurements) {
      dataStore.put({
        source,
        fragmentType,
        fragmentSeries,
        time: m.time,
        id: m.id,
        raw: JSON.stringify(m),
      } as MeasurementEntry);
    }

    coverageStore.put({
      source,
      fragmentType,
      fragmentSeries,
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

  clearForSource(source: string): Promise<void> {
    return this.openDb().then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction([STORE_DATA, STORE_COVERAGE], 'readwrite');

          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);

          const dataStore = tx.objectStore(STORE_DATA);
          const coverageStore = tx.objectStore(STORE_COVERAGE);

          const deleteAll = (store: IDBObjectStore) => {
            const range = IDBKeyRange.bound(
              [source, '', '', '', ''],
              [source, '\uffff', '\uffff', '\uffff', '\uffff']
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

          deleteAll(dataStore);
          deleteAll(coverageStore);
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

        if (!db.objectStoreNames.contains(STORE_DATA)) {
          // keyPath includes `time` then `id` so IDBKeyRange scans by time first
          db.createObjectStore(STORE_DATA, {
            keyPath: ['source', 'fragmentType', 'fragmentSeries', 'time', 'id'],
          });
        }

        if (!db.objectStoreNames.contains(STORE_COVERAGE)) {
          db.createObjectStore(STORE_COVERAGE, {
            keyPath: ['source', 'fragmentType', 'fragmentSeries', 'from'],
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
