import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { CacheEventsService } from './services/cache-events.service';
import { type CacheName, CacheLogService, type LogEventType } from './services/cache-log.service';
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
  host: {
    '[style.--idb-drawer-top.px]': 'drawerAnchor().top',
    '[style.--idb-drawer-left.px]': 'drawerAnchor().left',
  },
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

  /**
   * Where the drawer starts: below the page toolbar and right of the navigator. Measured from the
   * shell, because both move: the toolbar's height differs per page and the navigator is a narrow
   * rail when collapsed (asset navigator) or hidden. Values before the first measurement are the
   * old fixed offsets.
   */
  readonly drawerAnchor = signal({ top: 171, left: 250 });

  private ledHandle: ReturnType<typeof setTimeout> | null = null;
  private stopObservingShell: (() => void) | null = null;

  constructor() {
    effect(() => {
      // Skip the effect's initial run — no read has happened yet.
      if (this.events.readActivity() > 0) {
        this.flashReadIndicator();
      }
    });

    // Follow the shell only while the drawer is open.
    effect(() => {
      if (this.isCollapsed()) {
        this.unobserveShell();
      } else {
        this.measureShell();
        this.observeShell();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.unobserveShell();
      if (this.ledHandle !== null) clearTimeout(this.ledHandle);
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

  private measureShell(): void {
    const toolbarBottom = Math.max(
      0,
      ...visible(TOOLBAR_SELECTOR).map((element) => element.getBoundingClientRect().bottom)
    );
    const navigator = visible(NAVIGATOR_SELECTOR)[0];
    // an off-canvas navigator (narrow viewports) reports a right edge at or below 0
    const navigatorRight = navigator ? Math.max(0, navigator.getBoundingClientRect().right) : 0;

    if (toolbarBottom > 0) {
      this.drawerAnchor.set({ top: Math.round(toolbarBottom), left: Math.round(navigatorRight) });
    }
  }

  /**
   * Keeps the anchor current while the drawer is open:
   * - a `ResizeObserver` on navigator and toolbar: a collapse to a narrow rail is a width
   *   transition, so the drawer travels with it; toolbars differ in height per page
   * - the navigator's own CSS transitions: closing it completely slides it off-canvas at a
   *   constant width, which no resize reports — so measure on every frame while one runs
   * - `window.resize` for breakpoint changes
   */
  private observeShell(): void {
    this.unobserveShell();

    const measure = () => this.measureShell();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    const navigators = Array.from(document.querySelectorAll<HTMLElement>(NAVIGATOR_SELECTOR));

    [...navigators, ...visible(TOOLBAR_SELECTOR)].forEach((element) => observer?.observe(element));
    window.addEventListener('resize', measure);

    let frame: number | null = null;
    let followUntil = 0;
    const stopFollowing = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      measure();
    };
    const followFrames = () => {
      measure();
      // capped: should a `transitionend` never arrive, the loop must not run on forever
      frame = performance.now() < followUntil ? requestAnimationFrame(followFrames) : null;
    };
    // Transition events bubble: only the navigator's *own* transitions move it — a child's
    // (a node expanding) neither starts nor stops following.
    const onTransitionRun = (event: Event) => {
      if (event.target !== event.currentTarget) return;
      followUntil = performance.now() + MAX_FOLLOW_MS;
      if (frame === null) followFrames();
    };
    const onTransitionEnd = (event: Event) => {
      if (event.target !== event.currentTarget) return;
      stopFollowing();
    };

    navigators.forEach((element) => {
      element.addEventListener('transitionrun', onTransitionRun);
      element.addEventListener('transitionend', onTransitionEnd);
      element.addEventListener('transitioncancel', onTransitionEnd);
    });

    this.stopObservingShell = () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      navigators.forEach((element) => {
        element.removeEventListener('transitionrun', onTransitionRun);
        element.removeEventListener('transitionend', onTransitionEnd);
        element.removeEventListener('transitioncancel', onTransitionEnd);
      });
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }

  private unobserveShell(): void {
    this.stopObservingShell?.();
    this.stopObservingShell = null;
  }
}

/** Longest the drawer follows one navigator transition frame by frame. */
const MAX_FOLLOW_MS = 2_000;

/** The shell's page toolbar (action bar) — possibly several stacked, the lowest one counts. */
const TOOLBAR_SELECTOR = 'c8y-action-bar, .c8y-ui-action-bar';
const NAVIGATOR_SELECTOR = '.app-main-navigator, c8y-navigator, .navigator';

function visible(selector: string): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => element.getBoundingClientRect().height > 0
  );
}
