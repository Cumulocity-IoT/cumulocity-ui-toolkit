import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { CacheEventsService } from './services/cache-events.service';
import { CacheName, CacheLogService, LogEventType } from './services/cache-log.service';
import { CacheStateService } from './services/cache-state.service';
import { CacheStatsService } from './services/cache-stats.service';

interface StatRow {
  name: CacheName;
  shortLabel: string;
  elementCount: number;
}

const CACHE_LABELS: { name: CacheName; shortLabel: string }[] = [
  { name: 'new-series', shortLabel: 'New Series' },
  { name: 'old-series', shortLabel: 'Old Series' },
  { name: 'measurement', shortLabel: 'Measurements' },
];

const LOG_ICONS: Record<LogEventType, string> = {
  'cache-hit': 'check-circle',
  'partial-cache': 'bolt',
  'gap-skipped': 'forward',
  passthrough: 'cloud-download',
};

const LOG_ICON_CLASSES: Record<LogEventType, string> = {
  'cache-hit': 'text-success',
  'partial-cache': 'text-warning',
  'gap-skipped': 'text-muted',
  passthrough: 'text-info',
};

/** How long the read-activity indicator stays lit after the last read. */
const LED_LINGER_MS = 400;

@Component({
  selector: 'index-db-cache-action',
  templateUrl: './index-db-cache-action.component.html',
  styleUrl: './index-db-cache-action.component.less',
  standalone: true,
  imports: [CoreModule, CollapseModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class IndexDbCacheActionComponent {
  readonly isVisible = true;
  readonly priority = 100;
  readonly isCollapsed = signal(true);

  readonly logIcons = LOG_ICONS;
  readonly logIconClasses = LOG_ICON_CLASSES;

  private readonly cacheState = inject(CacheStateService);
  private readonly cacheStats = inject(CacheStatsService);
  private readonly logService = inject(CacheLogService);
  private readonly events = inject(CacheEventsService);

  readonly cachingActive = this.cacheState.active;
  readonly stats = this.cacheStats.stats;
  readonly clearing = this.cacheStats.clearing;
  readonly logs = this.logService.entries;
  readonly savedPercent = this.logService.savedPercent;
  readonly totalSavedKB = this.logService.totalSavedKB;

  /** Lights up briefly on every IndexedDB read — a floppy-drive style indicator. */
  readonly readingFromDb = signal(false);

  readonly statRows = computed<StatRow[] | undefined>(() => {
    const counts = this.stats()?.counts;

    if (!counts) return undefined;

    return CACHE_LABELS.map(({ name, shortLabel }) => ({
      name,
      shortLabel,
      elementCount: counts[name],
    }));
  });

  private ledHandle: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      // Skip the effect's initial run — no read has happened yet.
      if (this.events.readActivity() > 0) {
        this.flashReadIndicator();
      }
    });
  }

  toggle(): void {
    this.isCollapsed.update((collapsed) => !collapsed);
  }

  onActiveToggle(event: Event): void {
    this.cacheState.setActive((event.target as HTMLInputElement).checked);
  }

  clearAllCaches(): void {
    void this.cacheStats.clearAll();
  }

  clearLog(): void {
    this.logService.clearLog();
  }

  private flashReadIndicator(): void {
    this.readingFromDb.set(true);

    if (this.ledHandle !== null) {
      clearTimeout(this.ledHandle);
    }

    this.ledHandle = setTimeout(() => {
      this.ledHandle = null;
      this.readingFromDb.set(false);
    }, LED_LINGER_MS);
  }
}
