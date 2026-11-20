import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import {
  CoreModule,
  DashboardChildComponent,
  MeasurementRealtimeService,
} from '@c8y/ngx-components';
import { ContextDashboardComponent } from '@c8y/ngx-components/context-dashboard';
import type { KPIDetails } from '@c8y/ngx-components/datapoint-selector';
import { gettext } from '@c8y/ngx-components/gettext';
import { EMPTY, catchError, of, switchMap, timer } from 'rxjs';
import { GaugeArcComponent } from './components/gauge-arc/gauge-arc.component';
import {
  DEFAULT_TREND_POINT_COUNT,
  DEFAULT_TREND_WINDOW,
  DEFAULT_VARIANT,
  type KpiTrendDataState,
  type KpiTrendTrendWindow,
  type KpiTrendVariant,
  type KpiTrendWidgetConfig,
  MAX_TREND_POINT_COUNT,
  type SparklinePoint,
  STALE_THRESHOLD_MS,
  type ThresholdState,
} from './models/kpi-trend.model';
import {
  type KpiTrendDataParams,
  KpiTrendHistoryService,
} from './services/kpi-trend-history.service';

/**
 * The radial variant's main gauge is `GaugeArcComponent` (`components/gauge-arc`).
 *
 * Full-circle ring for Variant B's percentage: r = 12 in a 30-unit viewBox, c ≈ 75.4, starting at
 * 12 o'clock. It stays local: a percentage ring beside the value is a different instrument from
 * the main gauge, not a smaller one.
 */
const RING_R = 12;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_R;

/** Normalizes `ratio` to a dash length within the arc sweep. */
function arcDash(ratio: number, sweepLength: number): number {
  const clamped = Math.max(0, Math.min(1, ratio));
  return clamped * sweepLength;
}

/**
 * Projects sparkline values into SVG {x, y} coordinates. x follows the points' times, so a gap in
 * the data stays a gap in time instead of being spread evenly like the points around it.
 */
function toSvgCoords(
  points: readonly SparklinePoint[],
  width: number,
  height: number
): Array<{ x: number; y: number }> {
  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const times = points.map((p) => new Date(p.time).getTime());
  const t0 = times[0];
  const span = times[times.length - 1] - t0;
  return points.map((p, i) => ({
    x: (span > 0 ? (times[i] - t0) / span : i / (points.length - 1)) * width,
    y: height - ((p.value - min) / range) * (height * 0.85) - height * 0.05,
  }));
}

/** Smooth cubic-bezier SVG path through the sparkline coordinates. */
function toSvgPoints(points: readonly SparklinePoint[], width: number, height: number): string {
  if (points.length < 2) return '';
  const coords = toSvgCoords(points, width, height);
  let d = `M ${coords[0].x.toFixed(1)},${coords[0].y.toFixed(1)}`;

  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const cpX = ((prev.x + curr.x) / 2).toFixed(1);

    d += ` C ${cpX},${prev.y.toFixed(1)} ${cpX},${curr.y.toFixed(1)} ${curr.x.toFixed(1)},${curr.y.toFixed(1)}`;
  }

  return d;
}

/** Closed area-fill path beneath the smooth sparkline. */
function toFillPoints(points: readonly SparklinePoint[], width: number, height: number): string {
  if (points.length < 2) return '';
  const coords = toSvgCoords(points, width, height);
  const linePath = toSvgPoints(points, width, height);
  const lastX = coords[coords.length - 1].x.toFixed(1);
  return `${linePath} L ${lastX},${height} L 0,${height} Z`;
}

/**
 * The data point selector stores a cleared number field as `null` (`KPIDetails` fields are
 * `number | null`), and a cleared config input does the same; only a finite number counts as set.
 */
function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

/**
 * Whether `value` is in a threshold band. As the platform's KPI widget (`inRange`): a band needs
 * both bounds, and covers min ≤ value < max.
 */
function inBand(value: number, min: unknown, max: unknown): boolean {
  const lo = numberOrUndefined(min);
  const hi = numberOrUndefined(max);
  return lo !== undefined && hi !== undefined && value >= lo && value < hi;
}

/** The threshold band the value is in; red wins over yellow, as in the platform's KPI widget. */
function resolveThresholdState(value: number | undefined, dp: KPIDetails): ThresholdState {
  if (value === undefined) return 'default';
  if (inBand(value, dp.redRangeMin, dp.redRangeMax)) return 'critical';
  if (inBand(value, dp.yellowRangeMin, dp.yellowRangeMax)) return 'warning';

  return 'default';
}

/**
 * KPI Trend widget — displays one measurement as a gauge + sparkline trend.
 *
 * Supports two layout variants:
 * - `radial`: dominant arc gauge with sparkline footer strip (Variant A)
 * - `compact`: value + sparkline headline, % ring beside header and value (Variant B)
 *
 * Rendering: inline SVG (arc + polyline), no chart library dependency.
 * Data: realtime via `MeasurementRealtimeService`, history via the series API
 * (`KpiTrendHistoryService`).
 * Change detection: `OnPush` with signals throughout.
 */
@Component({
  selector: 'ps-kpi-trend-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CoreModule, GaugeArcComponent],
  providers: [KpiTrendHistoryService, MeasurementRealtimeService],
  templateUrl: './kpi-trend-widget.component.html',
  styleUrl: './kpi-trend-widget.component.less',
})
export class KpiTrendWidgetComponent {
  private readonly dashboardChild = inject(DashboardChildComponent, { optional: true });
  private readonly contextDashboard = inject(ContextDashboardComponent, { optional: true });
  private readonly historyService = inject(KpiTrendHistoryService);
  private readonly destroyRef = inject(DestroyRef);

  readonly config = input<KpiTrendWidgetConfig>();
  /** Set by the config dialog's preview, which debounces the history read. */
  readonly preview = input(false);

  // ── Derived config ─────────────────────────────────────────────────────────

  /**
   * The active data point: the selector marks it with `__active` (the section allows exactly one).
   * The first one stands in for a config saved without the flag.
   */
  protected readonly datapoint = computed<KPIDetails | undefined>(
    () => this.config()?.datapoints?.find((dp) => dp.__active) ?? this.config()?.datapoints?.[0]
  );

  /**
   * The device to read. On a device type dashboard, the dashboard's own device, as the platform's
   * KPI widget does (`assignContextFromContextDashboard`): the data point's `__target` is the device
   * it was configured on, and every other device of the type would show that one's data. Otherwise
   * the data point's target, then the config's device, the dashboard child's device and its
   * context.
   */
  protected readonly deviceId = computed<string | undefined>(() => {
    const dp = this.datapoint();

    if (!dp) return undefined;
    const dashboardContext = this.contextDashboard?.isDeviceTypeDashboard
      ? (this.contextDashboard.context as { id?: string | number } | undefined)?.id
      : undefined;
    const data = this.dashboardChild?.data as
      | { device?: { id?: string }; context?: { id?: string } }
      | undefined;
    const id =
      dashboardContext ??
      (dp as KPIDetails & { __target?: { id?: string | number } }).__target?.id ??
      this.config()?.device?.id ??
      data?.device?.id ??
      data?.context?.id;
    return id === undefined || id === null ? undefined : `${id}`;
  });

  protected readonly variant = computed<KpiTrendVariant>(
    () => this.config()?.variant ?? DEFAULT_VARIANT
  );

  /** At least 2 (a line needs two points), at most `MAX_TREND_POINT_COUNT`; a cleared field is `null`. */
  protected readonly trendPointCount = computed(() =>
    Math.max(
      2,
      Math.min(
        Math.round(this.config()?.trendPointCount ?? DEFAULT_TREND_POINT_COUNT),
        MAX_TREND_POINT_COUNT
      )
    )
  );

  /** The configured window, or the default while the amount field is empty or not positive. */
  protected readonly trendWindow = computed<KpiTrendTrendWindow>(
    () => {
      const window = this.config()?.trendWindow;
      return window && window.amount > 0 ? window : DEFAULT_TREND_WINDOW;
    },
    { equal: (a, b) => a.amount === b.amount && a.unit === b.unit }
  );

  /**
   * Everything the data stream depends on. Compared by value, so an edit that changes none of it
   * (layout, colour, min/max) does not refetch, and one that does (data point, window, sample
   * count) restarts the stream — in the config dialog's preview, the widget is not recreated.
   */
  private readonly dataParams = computed<KpiTrendDataParams | undefined>(
    () => {
      const deviceId = this.deviceId();
      const dp = this.datapoint();

      if (!deviceId || !dp?.fragment || !dp?.series) return undefined;
      const window = this.trendWindow();
      return {
        deviceId,
        fragment: dp.fragment,
        series: dp.series,
        trendWindowAmount: window.amount,
        trendWindowUnit: window.unit,
        trendPointCount: this.trendPointCount(),
      };
    },
    { equal: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );

  protected readonly higherIsBetter = computed(() => this.config()?.higherIsBetter ?? true);

  // ── Live state ─────────────────────────────────────────────────────────────

  protected readonly loading = signal(true);
  /** Read by `isStale`; a timer moves it when the newest measurement turns stale. */
  private readonly now = signal(Date.now());
  protected readonly currentValue = signal<number | undefined>(undefined);
  protected readonly lastMeasurementTime = signal<string | undefined>(undefined);
  protected readonly sparkline = signal<readonly SparklinePoint[]>([]);

  // ── Derived display values ─────────────────────────────────────────────────

  protected readonly unit = computed(() => this.datapoint()?.unit ?? '');
  protected readonly label = computed(
    () =>
      this.datapoint()?.label ??
      `${this.datapoint()?.fragment ?? ''}.${this.datapoint()?.series ?? ''}`
  );

  protected readonly icon = computed(() => this.config()?.icon ?? 'line-chart');

  /** Effective minimum — config override first, then KPI's min. Used in arc/ring ratio. */
  protected readonly minValue = computed<number | undefined>(
    () => numberOrUndefined(this.config()?.min) ?? numberOrUndefined(this.datapoint()?.min)
  );

  /** Effective maximum — config override first, then KPI's max. `undefined` = hide arc/ring. */
  protected readonly maxValue = computed<number | undefined>(
    () => numberOrUndefined(this.config()?.max) ?? numberOrUndefined(this.datapoint()?.max)
  );

  /**
   * Effective accent color — config override first, then the KPI's own manual color.
   * Applied to both the arc/ring gauge and the sparkline via the `--kt-accent` CSS custom
   * property; `undefined` leaves the stylesheet's `--c8y-brand-primary` fallback in place.
   */
  protected readonly accentColor = computed<string | undefined>(
    () => this.config()?.color || this.datapoint()?.color || undefined
  );

  protected readonly sourceBadge = computed(() => {
    const dp = this.datapoint();
    return dp ? `${dp.fragment}.${dp.series}` : '';
  });

  protected readonly thresholdState = computed<ThresholdState>(() => {
    const dp = this.datapoint();

    if (!dp) return 'default';

    return resolveThresholdState(this.currentValue(), dp);
  });

  /**
   * The gauge's colour: the accent outside the threshold bands. Inside one it is left unset, since
   * the gauge's `color` input overrides its `tone` and the band's status colour must show.
   */
  protected readonly gaugeColor = computed(() =>
    this.thresholdState() === 'default' ? this.accentColor() : undefined
  );

  protected readonly isStale = computed(() => {
    const time = this.lastMeasurementTime();

    if (!time) return false;

    return this.now() - new Date(time).getTime() > STALE_THRESHOLD_MS;
  });

  protected readonly isMissing = computed(
    () => !this.loading() && this.currentValue() === undefined
  );

  /**
   * Computes the arc fill ratio in [0, 1] using the effective min/max.
   * If min is not set, 0 is used as the range floor (preserving previous behaviour).
   */
  private readonly arcRatio = computed(() => {
    const max = this.maxValue();
    const val = this.currentValue();

    if (max === undefined || val === undefined) return 0;
    const min = this.minValue() ?? 0;
    const range = max - min;

    if (range <= 0) return 0;

    return Math.max(0, Math.min(1, (val - min) / range));
  });

  /**
   * Dash length of the compact ring's value arc. The ring is a full circle, so 100 % fills it.
   */
  protected readonly ringDashValue = computed(() => arcDash(this.arcRatio(), RING_CIRCUMFERENCE));

  protected readonly ringCircumference = RING_CIRCUMFERENCE;

  /** Percentage for the compact ring label (e.g. "21%"). */
  protected readonly ringPercent = computed(() => {
    if (this.maxValue() === undefined || this.currentValue() === undefined) return '';

    return `${Math.round(this.arcRatio() * 100)}%`;
  });

  /** Whether to show the arc/ring (requires an effective max). */
  protected readonly showArc = computed(() => this.maxValue() !== undefined);

  /** Short human-readable label for the configured trend window, e.g. "24h", "7d", "30min". */
  protected readonly trendWindowLabel = computed(() => {
    const w = this.trendWindow();
    const suffix = w.unit === 'minute' ? 'min' : w.unit === 'hour' ? 'h' : 'd';
    return `${w.amount}${suffix}`;
  });

  /** SVG points for the sparkline line (100 × height coordinate space). */
  protected readonly sparklineLinePoints = computed(() => toSvgPoints(this.sparkline(), 100, 48));

  protected readonly sparklineFillPoints = computed(() => toFillPoints(this.sparkline(), 100, 48));

  /** Last sparkline point for the end-dot. */
  protected readonly sparklineEndPoint = computed(() => {
    const pts = this.sparkline();

    if (pts.length < 2) return null;
    const coords = toSvgCoords(pts, 100, 48);
    const last = coords[coords.length - 1];
    return { x: last.x, y: last.y };
  });

  protected readonly hasSufficientHistory = computed(() => this.sparkline().length >= 2);

  /** Trend delta percentage over the window: the first interval's mean against the last one's. */
  protected readonly trendDelta = computed(() => {
    const pts = this.sparkline();

    if (pts.length < 2) return null;
    const first = pts[0].value;
    const last = pts[pts.length - 1].value;

    if (first === 0) return null;

    return ((last - first) / Math.abs(first)) * 100;
  });

  protected readonly trendDirection = computed<'up' | 'down' | 'flat'>(() => {
    const delta = this.trendDelta();

    if (delta === null || Math.abs(delta) < 0.05) return 'flat';

    return delta > 0 ? 'up' : 'down';
  });

  /** "▲ 2.4%"; `null` for a flat trend, which the template words as "steady". */
  protected readonly trendLabel = computed(() => {
    const delta = this.trendDelta();
    const dir = this.trendDirection();

    if (delta === null || dir === 'flat') return null;
    const arrow = dir === 'up' ? '▲' : '▼';
    return `${arrow} ${Math.abs(delta).toFixed(1)}%`;
  });

  protected readonly trendIsGood = computed(() => {
    const dir = this.trendDirection();

    if (dir === 'flat') return false;

    return this.higherIsBetter() ? dir === 'up' : dir === 'down';
  });

  protected readonly trendIsBad = computed(() => {
    const dir = this.trendDirection();

    if (dir === 'flat') return false;

    return this.higherIsBetter() ? dir === 'down' : dir === 'up';
  });

  /** Formatted value string (2 decimal places max, stripped trailing zeros). */
  protected readonly formattedValue = computed(() => {
    const val = this.currentValue();

    if (val === undefined) return '—';

    if (Math.abs(val) >= 1000) {
      return val.toLocaleString(undefined, { maximumFractionDigits: 0 });
    }

    return val.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
  });

  /** Accessible label: name, value and unit. The template appends the translated trend. */
  protected readonly ariaLabel = computed(
    () => `${this.label()}, ${this.formattedValue()} ${this.unit()}`
  );

  /** The trend part of the accessible label, as a translation key and its parameters. */
  protected readonly ariaTrend = computed(() => {
    const delta = this.trendDelta();
    const dir = this.trendDirection();

    if (delta === null || dir === 'flat') return null;

    return {
      key: dir === 'up' ? gettext('kpi-trend.aria-trend-up') : gettext('kpi-trend.aria-trend-down'),
      params: { delta: Math.abs(delta).toFixed(1), window: this.trendWindowLabel() },
    };
  });

  // ── Subscriptions ──────────────────────────────────────────────────────────

  constructor() {
    // React to datapoint + device config changes — restart all subscriptions.
    // On each (re)start:
    //   1. Fetch MO with withLatestValues:true → current value shown immediately.
    //   2. Fetch history in parallel → sparkline seeded.
    //   3. Realtime ticks → both current value and sparkline kept live.
    toObservable(this.dataParams)
      .pipe(
        switchMap((params) => {
          this.currentValue.set(undefined);
          this.lastMeasurementTime.set(undefined);
          this.sparkline.set([]);

          if (!params) {
            this.loading.set(false);

            return EMPTY;
          }
          this.loading.set(true);

          // In the config preview, typing "365" into the window field passes through "3" and "36";
          // wait for the typing to settle instead of reading each window.
          return (this.preview() ? timer(400) : of(0)).pipe(
            switchMap(() => this.historyService.data$(params).pipe(catchError(() => EMPTY)))
          );
        }),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((state: KpiTrendDataState) => {
        this.loading.set(false);
        this.currentValue.set(state.currentValue);
        this.lastMeasurementTime.set(state.currentTime);
        this.sparkline.set(state.sparkline);
      });

    // Moves `now` once, when the newest measurement turns stale; a new measurement replaces the
    // timer. No polling: nothing else on screen depends on the clock.
    effect((onCleanup) => {
      const time = this.lastMeasurementTime();

      if (!time) return;
      const due = new Date(time).getTime() + STALE_THRESHOLD_MS - Date.now();
      const id = setTimeout(() => this.now.set(Date.now()), Math.max(0, due) + 100);

      onCleanup(() => clearTimeout(id));
    });
  }
}
