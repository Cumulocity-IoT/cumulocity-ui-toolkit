import { Injectable, effect, inject, signal } from '@angular/core';
import { CacheEventsService } from './cache-events.service';
import { CacheName } from './cache-log.service';
import { MeasurementCacheService } from './measurement-cache.service';
import { NewSeriesCacheService } from './new-series-cache.service';
import { OldSeriesCacheService } from './old-series-cache.service';

export interface CacheStatsState {
  /** Number of cached data entries per cache. */
  counts: Record<CacheName, number>;
  /**
   * Origin-wide storage usage in MB as reported by the Storage API. This
   * cannot be attributed per cache, so it is tracked once globally.
   */
  storageSizeMB: number;
}

/** Collapses bursts of cache writes into a single recount. */
const REFRESH_DEBOUNCE_MS = 300;

/**
 * Keeps live entry counts for the three IndexedDB caches, recounting whenever
 * {@link CacheEventsService} reports a write or clear — no manual refresh.
 */
@Injectable({ providedIn: 'root' })
export class CacheStatsService {
  /** `undefined` until the first count has completed. */
  readonly stats = signal<CacheStatsState | undefined>(undefined);
  readonly clearing = signal(false);

  private readonly events = inject(CacheEventsService);
  private readonly newSeriesCache = inject(NewSeriesCacheService);
  private readonly oldSeriesCache = inject(OldSeriesCacheService);
  private readonly measurementCache = inject(MeasurementCacheService);

  private debounceHandle: ReturnType<typeof setTimeout> | null = null;
  /** Guards against an earlier, slower recount overwriting a newer result. */
  private refreshToken = 0;

  constructor() {
    effect(() => {
      this.events.changed();
      this.scheduleRefresh();
    });
  }

  async clearAll(): Promise<void> {
    this.clearing.set(true);

    try {
      await Promise.all([
        this.newSeriesCache.clearAll(),
        this.oldSeriesCache.clearAll(),
        this.measurementCache.clearAll(),
      ]);
    } catch {
      /* IndexedDB unavailable in this context */
    } finally {
      this.clearing.set(false);
    }
  }

  private scheduleRefresh(): void {
    if (this.debounceHandle !== null) {
      clearTimeout(this.debounceHandle);
    }

    this.debounceHandle = setTimeout(() => {
      this.debounceHandle = null;
      void this.refresh();
    }, REFRESH_DEBOUNCE_MS);
  }

  private async refresh(): Promise<void> {
    const token = ++this.refreshToken;

    try {
      const [newSeries, oldSeries, measurement, storageSizeMB] = await Promise.all([
        this.newSeriesCache.getStats(),
        this.oldSeriesCache.getStats(),
        this.measurementCache.getStats(),
        this.estimateStorageMB(),
      ]);

      // A newer recount finished first — keep its result.
      if (token !== this.refreshToken) return;

      this.stats.set({
        counts: {
          'new-series': newSeries.elementCount,
          'old-series': oldSeries.elementCount,
          measurement: measurement.elementCount,
        },
        storageSizeMB,
      });
    } catch {
      /* IndexedDB unavailable in this context */
    }
  }

  private async estimateStorageMB(): Promise<number> {
    try {
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();

        return (estimate.usage ?? 0) / (1024 * 1024);
      }
    } catch {
      /* unavailable in some contexts */
    }

    return 0;
  }
}
