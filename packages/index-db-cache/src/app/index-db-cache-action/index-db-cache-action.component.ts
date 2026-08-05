import { Component, OnDestroy, OnInit } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { Observable, Subject, takeUntil } from 'rxjs';
import {
  CacheLogEntry,
  CacheLogService,
  CacheName,
  LogEventType,
} from './services/cache-log.service';
import { CacheStateService } from './services/cache-state.service';
import { MeasurementCacheService } from './services/measurement-cache.service';
import { NewSeriesCacheService } from './services/new-series-cache.service';
import { OldSeriesCacheService } from './services/old-series-cache.service';

interface CacheStats {
  elementCount: number;
  storageSizeMB: number;
}

interface StatRow {
  name: CacheName;
  label: string;
  shortLabel: string;
  stats: CacheStats | undefined;
}

@Component({
  selector: 'index-db-cache-action',
  templateUrl: './index-db-cache-action.component.html',
  styleUrl: './index-db-cache-action.component.less',
  standalone: true,
  imports: [CoreModule, CollapseModule, TooltipModule],
})
export class IndexDbCacheActionComponent implements OnInit, OnDestroy {
  isVisible = true;
  isCollapsed = true;
  priority = 100;

  /** Current value of the caching-active toggle. */
  cachingActive = true;

  /** Per-cache statistics — `undefined` while not yet loaded. */
  statsMap: Partial<Record<CacheName, CacheStats>> = {};
  loadingStats = false;

  /** Which cache's `clearAll()` is currently in flight. */
  clearingCache: CacheName | null = null;

  /** Observable stream of live log entries (newest first). */
  logs$!: Observable<CacheLogEntry[]>;

  private readonly destroy$ = new Subject<void>();

  constructor(
    private readonly newSeriesCache: NewSeriesCacheService,
    private readonly oldSeriesCache: OldSeriesCacheService,
    private readonly measurementCache: MeasurementCacheService,
    readonly cacheState: CacheStateService,
    readonly logService: CacheLogService
  ) {}

  ngOnInit(): void {
    this.cachingActive = this.cacheState.isActive;
    this.logs$ = this.logService.entries$;

    // Sync toggle state if changed externally (e.g. another tab)
    this.cacheState.isActive$
      .pipe(takeUntil(this.destroy$))
      .subscribe((active) => (this.cachingActive = active));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ─── Action bar item ──────────────────────────────────────────────────────────

  toggle(): void {
    this.isCollapsed = !this.isCollapsed;

    if (!this.isCollapsed && !Object.keys(this.statsMap).length) {
      void this.refreshStats();
    }
  }

  onCollapsed(): void {
    /* noop — hook for post-collapse side effects */
  }

  // ─── Cache Control section ────────────────────────────────────────────────────

  onActiveToggle(event: Event): void {
    this.cacheState.setActive((event.target as HTMLInputElement).checked);
  }

  // ─── Statistics section ───────────────────────────────────────────────────────

  get statRows(): StatRow[] {
    return [
      {
        name: 'new-series',
        label: 'New Series (aggregationInterval)',
        shortLabel: 'New Series',
        stats: this.statsMap['new-series'],
      },
      {
        name: 'old-series',
        label: 'Old Series (aggregationType)',
        shortLabel: 'Old Series',
        stats: this.statsMap['old-series'],
      },
      {
        name: 'measurement',
        label: 'Raw Measurements',
        shortLabel: 'Measurements',
        stats: this.statsMap['measurement'],
      },
    ];
  }

  async refreshStats(): Promise<void> {
    this.loadingStats = true;

    try {
      const [newSeries, oldSeries, measurement] = await Promise.all([
        this.newSeriesCache.getStats(),
        this.oldSeriesCache.getStats(),
        this.measurementCache.getStats(),
      ]);

      this.statsMap = { 'new-series': newSeries, 'old-series': oldSeries, measurement };
    } catch {
      /* IndexedDB unavailable in this context */
    } finally {
      this.loadingStats = false;
    }
  }

  async clearCache(name: CacheName): Promise<void> {
    this.clearingCache = name;

    try {
      await this.cacheForName(name).clearAll();
    } finally {
      this.clearingCache = null;
      await this.refreshStats();
    }
  }

  private cacheForName(
    name: CacheName
  ): NewSeriesCacheService | OldSeriesCacheService | MeasurementCacheService {
    switch (name) {
      case 'new-series':
        return this.newSeriesCache;
      case 'old-series':
        return this.oldSeriesCache;
      case 'measurement':
        return this.measurementCache;
    }
  }

  // ─── Live log section ─────────────────────────────────────────────────────────

  clearLog(): void {
    this.logService.clearLog();
  }

  logIcon(type: LogEventType): string {
    switch (type) {
      case 'cache-hit':
        return 'check-circle';
      case 'partial-cache':
        return 'bolt';
      case 'gap-skipped':
        return 'forward';
      default:
        return 'cloud-download';
    }
  }

  logIconClass(type: LogEventType): string {
    switch (type) {
      case 'cache-hit':
        return 'text-success';
      case 'partial-cache':
        return 'text-warning';
      case 'gap-skipped':
        return 'text-muted';
      default:
        return 'text-info';
    }
  }
}
