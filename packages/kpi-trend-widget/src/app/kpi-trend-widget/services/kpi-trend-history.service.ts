import { Injectable, inject } from '@angular/core';
import { type ISeriesFilter, InventoryService, MeasurementService } from '@c8y/client';
import { MeasurementRealtimeService } from '@c8y/ngx-components';
import { type Observable, combineLatest, filter, from, map, merge, scan } from 'rxjs';
import {
  DEFAULT_TREND_POINT_COUNT,
  DEFAULT_TREND_WINDOW,
  type KpiTrendDataState,
  MAX_TREND_POINT_COUNT,
  type SparklinePoint,
} from '../models/kpi-trend.model';

/** Parameters driving the data fetch and realtime stream. */
export interface KpiTrendDataParams {
  deviceId: string;
  fragment: string;
  series: string;
  trendWindowAmount?: number;
  trendWindowUnit?: 'minute' | 'hour' | 'day';
  trendPointCount?: number;
}

const UNIT_MS: Record<string, number> = { minute: 60_000, hour: 3_600_000, day: 86_400_000 };

/**
 * Aggregation intervals the history is read at, in seconds. Round values only: the series API
 * answered a 7-day window in 2 s at 10 min, but in 24 s at 605 s (measured 2026-11-12).
 */
const BUCKET_LADDER_S = [
  5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600, 43200, 86400,
];

/**
 * Most buckets one history read may return. Well below the series API's 5,000-value cap, and fine
 * enough that the sliding interval means below stay smooth.
 */
const MAX_BUCKETS = 1500;

/**
 * Measurements summed over one aggregation bucket: the history arrives like this, and realtime
 * ticks are folded into the bucket they fall in, so memory stays bounded by the bucket count.
 */
interface Bucket {
  start: number;
  /** Sum of the measurements' times, for the mean time. */
  tSum: number;
  /** Sum of the measurements' values. */
  sum: number;
  n: number;
}

interface Acc {
  buckets: Bucket[];
  /** The window ends here: the fetch time, then the newest tick. */
  end: number;
  current: SparklinePoint | null;
}

/**
 * Splits [start, end] into `count` equal intervals and returns the mean of each non-empty one,
 * placed at the mean time of its measurements. `buckets` must be in ascending time order.
 *
 * Means rather than picked samples: picking every n-th measurement of a noisy series (a
 * temperature every 15 s, 240 values an hour, picked down to 24) draws whichever outliers happen
 * to land on the grid, so the line matched neither the data nor the data point graph's shape.
 */
function intervalMeans(
  buckets: readonly Bucket[],
  start: number,
  end: number,
  count: number
): SparklinePoint[] {
  const width = (end - start) / count;

  if (!(width > 0)) return [];
  const sum = new Array<number>(count).fill(0);
  const tSum = new Array<number>(count).fill(0);
  const n = new Array<number>(count).fill(0);

  for (const b of buckets) {
    const t = b.tSum / b.n;

    if (t < start || t > end) continue;
    const i = Math.min(count - 1, Math.floor((t - start) / width));

    sum[i] += b.sum;
    tSum[i] += b.tSum;
    n[i] += b.n;
  }
  const out: SparklinePoint[] = [];

  for (let i = 0; i < count; i++) {
    if (n[i] > 0) out.push({ value: sum[i] / n[i], time: new Date(tSum[i] / n[i]).toISOString() });
  }

  return out;
}

/**
 * Adds one realtime measurement: into its bucket (aligned like the platform's, to multiples of the
 * interval), the window's end moves to it if it is the newest, and buckets that left the window are
 * dropped. A late measurement lands in its own bucket, wherever that is.
 */
function applyTick(acc: Acc, tick: SparklinePoint, spanMs: number, bucketMs: number): Acc {
  const t = new Date(tick.time).getTime();
  const end = Math.max(acc.end, t);
  const start = Math.floor(t / bucketMs) * bucketMs;
  const firstKept = acc.buckets.findIndex((b) => b.start + bucketMs > end - spanMs);
  const buckets = firstKept < 0 ? [] : acc.buckets.slice(firstKept);
  let i = buckets.length - 1;

  while (i >= 0 && buckets[i].start > start) i--;

  if (i >= 0 && buckets[i].start === start) {
    const b = buckets[i];

    buckets[i] = { start, tSum: b.tSum + t, sum: b.sum + tick.value, n: b.n + 1 };
  } else {
    buckets.splice(i + 1, 0, { start, tSum: t, sum: tick.value, n: 1 });
  }
  const isNewest = !acc.current || t >= new Date(acc.current.time).getTime();
  return { buckets, end, current: isNewest ? tick : acc.current };
}

/**
 * Data service for the KPI Trend widget.
 *
 * Loading strategy:
 * 1. **Current value** — `InventoryService.detail(deviceId, { withLatestValues: true })` reads
 *    `c8y_LatestMeasurements[fragment][series]`, available without waiting for a realtime tick.
 * 2. **Sparkline history** — one `/measurement/measurements/series` read of the trend window with
 *    `avg` and `count` per bucket, at the smallest round interval that keeps the window within
 *    `MAX_BUCKETS`. The platform aggregates, so a long window costs one request instead of one
 *    page per 2,000 measurements. The sparkline is the mean of each of `trendPointCount` equal
 *    intervals of the window, weighted by the buckets' counts.
 * 3. **Realtime** — `MeasurementRealtimeService.onCreate$()` is subscribed together with the two
 *    reads, so no measurement created while they load is lost: ticks are held until the history
 *    arrives, and those newer than its end are then applied. Each tick updates the current value
 *    and is added to its bucket; the window then ends at the tick, older buckets drop out and the
 *    interval means are recomputed.
 *
 * Component-provided (no `providedIn: 'root'`), so it is destroyed with the widget instance.
 */
@Injectable()
export class KpiTrendHistoryService {
  private readonly inventoryService = inject(InventoryService);
  private readonly measurementService = inject(MeasurementService);
  private readonly measurementRealtimeService = inject(MeasurementRealtimeService);

  /**
   * Observable of the combined widget data state. Emits once both reads resolved, then on every
   * realtime tick of the configured series. Ticks of the device's other series emit nothing.
   */
  data$(params: KpiTrendDataParams): Observable<KpiTrendDataState> {
    const maxPoints = Math.min(
      params.trendPointCount ?? DEFAULT_TREND_POINT_COUNT,
      MAX_TREND_POINT_COUNT
    );
    const spanMs =
      (params.trendWindowAmount ?? DEFAULT_TREND_WINDOW.amount) *
      (UNIT_MS[params.trendWindowUnit ?? DEFAULT_TREND_WINDOW.unit] ?? UNIT_MS['hour']);
    const bucketS = BUCKET_LADDER_S.find((s) => spanMs / (s * 1000) <= MAX_BUCKETS) ?? 86400;
    const bucketMs = bucketS * 1000;

    const initial$ = combineLatest([
      from(this.fetchLatestValue(params.deviceId, params.fragment, params.series)),
      from(this.fetchHistory(params, spanMs, bucketS)),
    ]).pipe(map(([current, history]): Acc => ({ ...history, current })));

    const ticks$ = this.measurementRealtimeService.onCreate$(params.deviceId).pipe(
      map((measurement) => this.extractPoint(measurement, params.fragment, params.series)),
      filter((point): point is SparklinePoint => point !== null)
    );

    // `acc` stays null until the reads resolve; ticks seen before that wait in `pending`.
    type Step = { acc: Acc | null; pending: SparklinePoint[] };
    type Event = { init: Acc } | { tick: SparklinePoint };

    return merge(
      initial$.pipe(map((init): Event => ({ init }))),
      ticks$.pipe(map((tick): Event => ({ tick })))
    ).pipe(
      scan<Event, Step>(
        (step, event) => {
          if ('init' in event) {
            const fetchedUntil = event.init.end;
            // Ticks up to the fetch's end are already in the history.
            const acc = step.pending
              .filter((tick) => new Date(tick.time).getTime() > fetchedUntil)
              .reduce((a, tick) => applyTick(a, tick, spanMs, bucketMs), event.init);
            return { acc, pending: [] };
          }
          if (!step.acc) return { acc: null, pending: [...step.pending, event.tick] };

          return { acc: applyTick(step.acc, event.tick, spanMs, bucketMs), pending: [] };
        },
        { acc: null, pending: [] }
      ),
      filter((step): step is { acc: Acc; pending: SparklinePoint[] } => step.acc !== null),
      map(({ acc }) => ({
        currentValue: acc.current?.value,
        currentTime: acc.current?.time,
        sparkline: intervalMeans(acc.buckets, acc.end - spanMs, acc.end, maxPoints),
      }))
    );
  }

  /** Reads `c8y_LatestMeasurements[fragment][series]` from the managed object. */
  private async fetchLatestValue(
    deviceId: string,
    fragment: string,
    series: string
  ): Promise<SparklinePoint | null> {
    try {
      const { data } = await this.inventoryService.detail(deviceId, {
        withLatestValues: true,
      });
      const latestMeasurements = (data as Record<string, unknown>)['c8y_LatestMeasurements'];

      if (typeof latestMeasurements !== 'object' || latestMeasurements === null) return null;

      const fragmentData = (latestMeasurements as Record<string, unknown>)[fragment];

      if (typeof fragmentData !== 'object' || fragmentData === null) return null;

      const seriesData = (fragmentData as Record<string, unknown>)[series];

      if (typeof seriesData !== 'object' || seriesData === null) return null;

      const { value, time } = seriesData as { value?: unknown; time?: unknown };

      if (typeof value !== 'number' || typeof time !== 'string') return null;

      return { value, time };
    } catch {
      return null;
    }
  }

  /**
   * Reads the window as `avg` + `count` per bucket, oldest first. A platform that ignores
   * `aggregationFunction` answers `min`/`max` only; the bucket's midrange then stands in for its
   * mean, which is close at `MAX_BUCKETS` buckets per window. Any failure yields an empty history,
   * so the widget still shows the current value.
   */
  private async fetchHistory(
    params: KpiTrendDataParams,
    spanMs: number,
    bucketS: number
  ): Promise<{ buckets: Bucket[]; end: number }> {
    const end = Date.now();
    const bucketMs = bucketS * 1000;
    const seriesFilter: ISeriesFilter = {
      source: params.deviceId,
      series: `${params.fragment}.${params.series}`,
      dateFrom: new Date(end - spanMs).toISOString(),
      dateTo: new Date(end).toISOString(),
      aggregationInterval: `${bucketS}s`,
      aggregationFunction: ['avg', 'count'],
    };

    try {
      const { data, res } = await this.measurementService.listSeries(seriesFilter);

      // listSeries resolves on any HTTP status, with the error body as data.
      if (!res.ok) return { buckets: [], end };
      const buckets: Bucket[] = [];

      for (const [time, entries] of Object.entries(data.values ?? {})) {
        const entry = entries?.[0] as {
          min?: number;
          max?: number;
          avg?: number;
          count?: number;
        } | null;

        if (!entry) continue;
        const value =
          entry.avg ??
          (typeof entry.min === 'number' && typeof entry.max === 'number'
            ? (entry.min + entry.max) / 2
            : undefined);

        if (typeof value !== 'number') continue;
        const n = entry.count && entry.count > 0 ? entry.count : 1;
        const start = new Date(time).getTime();
        // The middle of the part of the bucket inside the window: the first and the last bucket
        // reach past it, and a middle outside would drop them from the interval means.
        const mid = (Math.max(start, end - spanMs) + Math.min(start + bucketMs, end)) / 2;

        buckets.push({ start, tSum: mid * n, sum: value * n, n });
      }

      return { buckets: buckets.sort((a, b) => a.start - b.start), end };
    } catch {
      return { buckets: [], end };
    }
  }

  private extractPoint(
    measurement: Record<string, unknown>,
    fragment: string,
    series: string
  ): SparklinePoint | null {
    const fragmentData = measurement[fragment];

    if (typeof fragmentData !== 'object' || fragmentData === null) return null;

    const seriesData = (fragmentData as Record<string, unknown>)[series];

    if (typeof seriesData !== 'object' || seriesData === null) return null;

    const { value } = seriesData as { value?: unknown };
    const time = measurement['time'];

    if (typeof value !== 'number' || typeof time !== 'string') return null;

    return { value, time };
  }
}
