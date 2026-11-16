import { type KPIDetails } from '@c8y/ngx-components/datapoint-selector';

export type KpiTrendVariant = 'radial' | 'compact';

export interface KpiTrendTrendWindow {
  amount: number;
  unit: 'minute' | 'hour' | 'day';
}

/**
 * Widget configuration persisted on the dashboard card.
 *
 * `datapoints` is the stock `KPIDetails[]` from the platform's datapoint selector —
 * exactly one entry is enforced by `minActiveCount = maxActiveCount = 1` on the selector.
 */
export interface KpiTrendWidgetConfig {
  /**
   * Exactly one active datapoint — enforced by the selector config.
   * Keyed by `fragment` + `series`; all visual and threshold fields come from here.
   */
  datapoints?: KPIDetails[];

  /** The widget's device as the platform's target picker stores it; a fallback after `__target`. */
  device?: { id?: string | number };

  /** `dlt-c8y-icon` glyph name, chosen with IconSelectorWrapperComponent. */
  icon?: string;

  /**
   * Layout variant.
   * - `radial` (default): dominant arc, sparkline as quiet footer strip (Variant A)
   * - `compact`: value + sparkline as headline, % ring beside the header and value (Variant B)
   */
  variant?: KpiTrendVariant;

  /** Lookback window for the sparkline. Default: 1 hour. */
  trendWindow?: KpiTrendTrendWindow;

  /** Sparkline sample count, hard cap 40. Default: 24. */
  trendPointCount?: number;

  /**
   * `true` (default): upward trend is "good" (green), downward is "bad" (red).
   * `false`: inverted — used for KPIs like temperature or vibration where lower is better.
   */
  higherIsBetter?: boolean;

  /**
   * Override the minimum value for arc/ring ratio calculation.
   * Falls back to `KPIDetails.min` from the datapoint selector, then 0. A cleared field is `null`.
   */
  min?: number | null;

  /**
   * Override the maximum value for arc/ring ratio calculation.
   * Falls back to `KPIDetails.max` from the datapoint selector.
   * If neither is set, the arc and ring are not displayed. A cleared field is `null`.
   */
  max?: number | null;

  /**
   * Single accent color applied to both the arc/ring gauge and the sparkline.
   * Falls back to `KPIDetails.color` from the datapoint selector, then to the
   * platform's `--c8y-brand-primary` token. Suppresses the auto "good" green so the
   * chosen accent isn't overridden — threshold coloring (`yellowRange`/`redRange`)
   * still takes priority when the current value is actually in one of those bands.
   */
  color?: string;
}

/** A single sparkline data point (value + ISO timestamp). */
export interface SparklinePoint {
  value: number;
  time: string;
}

/**
 * Combined data state emitted by `KpiTrendHistoryService.data$()`.
 *
 * - `currentValue` / `currentTime`: sourced from `c8y_LatestMeasurements` on load,
 *   then updated from each realtime tick.
 * - `sparkline`: seeded from the series API, then updated by realtime ticks.
 */
export interface KpiTrendDataState {
  currentValue: number | undefined;
  currentTime: string | undefined;
  sparkline: readonly SparklinePoint[];
}

/**
 * Which threshold band the current value is in — drives the status colour.
 * `default` = in no band (or none configured): the accent colour applies.
 */
export type ThresholdState = 'warning' | 'critical' | 'default';

/** Default lookback window (1 hour). */
export const DEFAULT_TREND_WINDOW: KpiTrendTrendWindow = { amount: 1, unit: 'hour' };

/** Default sparkline sample count. */
export const DEFAULT_TREND_POINT_COUNT = 24;

/** Hard cap on sparkline samples to avoid rendering too many SVG points. */
export const MAX_TREND_POINT_COUNT = 40;

/** Default layout variant. */
export const DEFAULT_VARIANT: KpiTrendVariant = 'radial';

/**
 * A value is considered stale when the last measurement is older than this threshold.
 */
export const STALE_THRESHOLD_MS = 60_000;
