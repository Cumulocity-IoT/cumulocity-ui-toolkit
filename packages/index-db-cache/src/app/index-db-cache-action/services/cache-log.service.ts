import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

// ─── Public types ─────────────────────────────────────────────────────────────

export type CacheName = 'new-series' | 'old-series' | 'measurement';

/** How the interceptor handled the request. */
export type LogEventType =
  /** All data served entirely from IndexedDB, zero API calls. */
  | 'cache-hit'
  /** Some date windows were fetched from the API; remainder served from cache. */
  | 'partial-cache'
  /** A gap window was narrower than one aggregation bucket and was skipped. */
  | 'gap-skipped'
  /** Request was not eligible (e.g. live data, no source param, paginated). */
  | 'passthrough';

export interface CacheLogEntry {
  /** Auto-incrementing sequence number for `@for track`. */
  id: number;
  /** Wall-clock time this entry was created. */
  ts: Date;
  cache: CacheName;
  eventType: LogEventType;
  /** Source device managed-object ID. */
  source: string;
  dateFrom: Date;
  dateTo: Date;
  /** Series strings (`"fragment.series"`) or fragment/series pair keys. */
  keys: string[];
  /** Number of uncached date windows fetched from the Cumulocity API. */
  gapCount: number;
  /** Time spent reading the result from IndexedDB (ms). 0 if not measured. */
  idbReadMs: number;
  /**
   * Approximate bytes of data served from cache in this request
   * (estimated as the JSON string length of the synthesised response body).
   */
  cachedBytes: number;
  /**
   * Approximate bytes of raw API response data fetched for gap windows,
   * estimated as the JSON string length of each gap's response body.
   */
  fetchedBytes: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

const MAX_ENTRIES = 200;

/**
 * Maintains a ring-buffer of the last {@link MAX_ENTRIES} cache intercept
 * events and running byte-count totals used to calculate bandwidth savings.
 *
 * Injected by the three interceptor services to record events, and by
 * {@link IndexDbCacheActionComponent} to present them in the UI.
 */
@Injectable({ providedIn: 'root' })
export class CacheLogService {
  private seq = 0;
  private _totalCachedBytes = 0;
  private _totalFetchedBytes = 0;

  private readonly _entries$ = new BehaviorSubject<CacheLogEntry[]>([]);

  /** Observable stream of the current log ring-buffer (newest first). */
  readonly entries$ = this._entries$.asObservable();

  /** Percentage of total bytes served from cache vs fetched from API (0–100). */
  get savedPercent(): number {
    const total = this._totalCachedBytes + this._totalFetchedBytes;

    return total > 0 ? Math.round((this._totalCachedBytes / total) * 100) : 0;
  }

  /** Total bytes served from cache across all tracked requests, in KB. */
  get totalSavedKB(): number {
    return Math.round(this._totalCachedBytes / 1024);
  }

  push(entry: Omit<CacheLogEntry, 'id' | 'ts'>): void {
    this._totalCachedBytes += entry.cachedBytes;
    this._totalFetchedBytes += entry.fetchedBytes;

    const full: CacheLogEntry = { ...entry, id: ++this.seq, ts: new Date() };
    const prev = this._entries$.value;

    this._entries$.next([full, ...prev].slice(0, MAX_ENTRIES));
  }

  clearLog(): void {
    this._totalCachedBytes = 0;
    this._totalFetchedBytes = 0;
    this._entries$.next([]);
  }
}
