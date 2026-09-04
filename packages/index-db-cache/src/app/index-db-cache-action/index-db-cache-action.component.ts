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
import { NavigationAbortStateService } from './services/navigation-abort-state.service';

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

/**
 * The trade-off behind the navigation-abort switch, stated in the drawer so the
 * operator flipping it knows what they are buying and what they are risking.
 */
const ABORT_HELP =
  'Gain: leaving a dashboard drops its pending reads immediately, ' +
  'so a widget that fans out dozens of measurement requests stops holding ' +
  'browser connections the next page needs. ' +
  'Risk: a cancelled request fails rather than never finishing, so widgets ' +
  'that do not recognise an AbortError may show a load error while you ' +
  'navigate. Only GET requests to measurements, alarms and events are ' +
  'cancelled — saving is never interrupted, and inventory, realtime and shell ' +
  'requests always run to completion.';

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

  readonly abortHelp = ABORT_HELP;

  private readonly cacheState = inject(CacheStateService);
  private readonly abortState = inject(NavigationAbortStateService);
  private readonly cacheStats = inject(CacheStatsService);
  private readonly logService = inject(CacheLogService);
  private readonly events = inject(CacheEventsService);

  readonly cachingActive = this.cacheState.active;
  readonly abortOnNavigation = this.abortState.active;
  readonly cancelledCount = this.abortState.cancelledCount;
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

  onAbortToggle(event: Event): void {
    this.abortState.setActive((event.target as HTMLInputElement).checked);
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
