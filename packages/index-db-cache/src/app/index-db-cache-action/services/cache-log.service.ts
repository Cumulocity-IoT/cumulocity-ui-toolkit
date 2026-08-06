import { Injectable, computed, signal } from '@angular/core';

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
  /** The current log ring-buffer (newest first). */
  readonly entries = signal<CacheLogEntry[]>([]);

  /** Percentage of total bytes served from cache vs fetched from API (0–100). */
  readonly savedPercent = computed(() => {
    const total = this.totalCachedBytes() + this.totalFetchedBytes();

    return total > 0 ? Math.round((this.totalCachedBytes() / total) * 100) : 0;
  });

  /** Total bytes served from cache across all tracked requests, in KB. */
  readonly totalSavedKB = computed(() => Math.round(this.totalCachedBytes() / 1024));

  private seq = 0;
  private readonly totalCachedBytes = signal(0);
  private readonly totalFetchedBytes = signal(0);

  push(entry: Omit<CacheLogEntry, 'id' | 'ts'>): void {
    this.totalCachedBytes.update((b) => b + entry.cachedBytes);
    this.totalFetchedBytes.update((b) => b + entry.fetchedBytes);

    const full: CacheLogEntry = { ...entry, id: ++this.seq, ts: new Date() };

    this.entries.update((prev) => [full, ...prev].slice(0, MAX_ENTRIES));
  }

  clearLog(): void {
    this.totalCachedBytes.set(0);
    this.totalFetchedBytes.set(0);
    this.entries.set([]);
  }
}
