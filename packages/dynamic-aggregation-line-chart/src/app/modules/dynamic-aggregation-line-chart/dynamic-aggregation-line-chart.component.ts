import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, SimpleChanges } from '@angular/core';
import { subMonths } from 'date-fns';
import { ChartDataService } from '../../shared/chart-helpers/chart-data.service';
import { AggregatedISeries } from '../../shared/chart-helpers/chart-data.service';
import { MeasurementCacheService } from '../../shared/chart-helpers/measurement-cache.service';
import { AggregationService } from '../../shared/chart-helpers/aggregation.service';
import { DataItem, LineChartData } from '../../shared/line-chart.component';
import { KPIDetails } from '@c8y/ngx-components/datapoint-selector';
import { ThresholdConfig, ThresholdLine } from './ps-line-chart.model';
import { throttle } from '@c8y/ngx-components';

@Component({
  templateUrl: './dynamic-aggregation-line-chart.component.html',
  styleUrls: ['./dynamic-aggregation-line-chart.component.less'],
  providers: [ChartDataService, AggregationService],
})
/**
 * Widget that renders a line chart and keeps a cached copy of the full-range
 * dataset while allowing users to zoom-in for a higher-resolution subset.
 */
export class DynamicAggregationLineChartComponent implements OnInit, OnChanges, OnDestroy {
  /** Widget configuration supplied by the dashboard runtime. */
  @Input() config!: any;

  /** Aggregation functions available for the chart. */
  private readonly defaultAggregationFunctions = ['min', 'avg', 'max'];

  private getSelectedAggregationFunctions(): string[] {
    const functions = this.config?.['aggregationFunctions'];
    if (Array.isArray(functions) && functions.length > 0) {
      return functions;
    }
    return this.defaultAggregationFunctions;
  }

  /** Current chart series data shown in the chart. */
  data: LineChartData = {};

  /** Threshold lines (horizontal) to draw on the chart. */
  thresholdLines: ThresholdLine[] = [];

  /** Whether the chart is currently loading data from the backend. */
  loading = false;

  /** Start of the overall time range (from dashboard global time or widget config). */
  dateFrom: Date = subMonths(new Date(), 3);

  /** End of the overall time range (from dashboard global time or widget config). */
  dateTo: Date = new Date();

  /** Time range used for formatting the x-axis labels. Updated on zoom. */
  zoomedTimeRange: { dateFrom: Date; dateTo: Date } = { dateFrom: this.dateFrom, dateTo: this.dateTo };

  /** Current aggregation interval used for the chart (e.g. "1h", "1d"). */
  currentInterval = '';

  /** Aggregation interval computed for the overall date range. */
  overallInterval = '';

  /** Aggregation interval computed for the zoomed-in range (if any). */
  zoomedInterval = '';

  /** Number of data points in the overall dataset. */
  baseDataPointCount = 0;

  /** Number of data points in the zoomed dataset. */
  zoomedDataPointCount = 0;

  /** Log entries from the cache service shown in the sidebar. */
  cacheLog: string[] = [];

  /** Whether the statistics panel is expanded (default: open). */
  statsExpanded = true;

  /** Whether the cache info panel is expanded. */
  cacheExpanded = false;

  /** Stats loaded from IndexedDB when the cache panel is opened. */
  cacheStats: { elementCount: number; storageSizeMB: number } | null = null;

  /** True while the async clear operation is in progress. */
  clearingCache = false;

  /** Cached full-range dataset (used to merge with zoomed-in points). */
  private baseData: LineChartData = {};

/**
   * Count of points currently displayed in the chart (matches `data.avg.length`).
   */
  get dataPointCount(): number {
    const fn = this.getSelectedAggregationFunctions()[0];
    return this.data[fn]?.length ?? 0;
  }

  /** Last zoomed range (epoch ms) to avoid repeated reloads of the same range. */
  private lastZoomFrom?: number;
  private lastZoomTo?: number;

  /** Internal destroy notifier for RxJS subscriptions. */
  private destroy$ = new EventEmitter<void>();

  constructor(
    private chartData: ChartDataService,
    private aggregationService: AggregationService,
    private cache: MeasurementCacheService,
  ) { }

  /** Toggles the cache info panel and loads fresh stats when opening. */
  async toggleCache(): Promise<void> {
    this.cacheExpanded = !this.cacheExpanded;
    if (this.cacheExpanded) {
      this.cacheStats = await this.cache.getStats();
    }
  }

  /** Clears all IndexedDB entries for the series keys configured in this widget. */
  async clearCache(): Promise<void> {
    const deviceId = this.config.device?.id as string | undefined;
    const datapoints = this.config.datapoints as KPIDetails[] | undefined;
    if (!deviceId || !datapoints?.length) return;

    this.clearingCache = true;
    try {
      const seriesKeys = datapoints.map(dp => `${dp.fragment}.${dp.series}`);
      await this.cache.clearForDatapoints(deviceId, seriesKeys);
      this.cacheLog = ['Cache cleared'];
      this.cacheStats = await this.cache.getStats();
    } finally {
      this.clearingCache = false;
    }
  }

  /**
   * Cleanup any subscriptions when the widget is destroyed.
   */
  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Initialize subscriptions and start the first load.
   */
  ngOnInit(): void {
    if (Array.isArray(this.config?.date)) {
      const [dateFrom, dateTo] = this.config.date;
      this.dateFrom = new Date(dateFrom);
      this.dateTo = new Date(dateTo);
      this.zoomedTimeRange = { dateFrom: this.dateFrom, dateTo: this.dateTo };
    }
    this.reload();
  }

/**
   * React to changes from container (e.g. dashboard time range updates).
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (!changes['config']?.currentValue) return;
    if (changes['config'].firstChange) return;

    if (Array.isArray(changes['config'].currentValue.date)) {
      const [dateFrom, dateTo] = changes['config'].currentValue.date;
      this.dateFrom = new Date(dateFrom);
      this.dateTo = new Date(dateTo);
      this.zoomedTimeRange = { dateFrom: this.dateFrom, dateTo: this.dateTo };
      this.reload();
    }
  }

  /**
   * Reloads the full-range dataset (used on initial widget load and when the global time range changes).
   */
   @throttle(600, { trailing: false })
  private async reload(): Promise<void> {
    const id = this.config.device?.id;
    const datapoints = this.config.datapoints as KPIDetails[] | undefined;
    if (!id || !datapoints?.length) return;

    this.loading = true;
    this.cacheLog = [];
    const interval = this.aggregationService.computeAggregationInterval(this.dateFrom, this.dateTo);
    this.overallInterval = interval;
    this.currentInterval = interval;
    this.zoomedInterval = '';
    this.zoomedDataPointCount = 0;

    try {
      await this.loadDatapoints(id, this.dateFrom, this.dateTo, interval, datapoints, false);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Fetches data for all configured datapoints in parallel, builds combined
   * LineChartData and computes threshold lines from the results.
   */
  private async loadDatapoints(
    id: string,
    dateFrom: Date,
    dateTo: Date,
    interval: string,
    datapoints: KPIDetails[],
    isZoom: boolean,
  ): Promise<void> {
    const functions = this.getSelectedAggregationFunctions();
    const thresholdConfigs = this.config.thresholdConfigs as Record<string, ThresholdConfig> | undefined;

    const results = await Promise.all(
      datapoints.map(dp =>
        this.fetchWithCache(
          id, `${dp.fragment}.${dp.series}`, interval, dateFrom, dateTo, functions,
        ).then(data => ({ dp, data })),
      ),
    );

    const combined: LineChartData = {};
    const newThresholdLines: ThresholdLine[] = [];

    for (const { dp, data } of results) {
      const label = dp.label || dp.series;
      const key = `${dp.fragment}.${dp.series}`;
      const seriesData = this.transformData(data, functions);

      for (const fn of functions) {
        const seriesKey = datapoints.length > 1 ? `${label} (${fn})` : fn;
        combined[seriesKey] = seriesData[fn] ?? [];
      }

      const cfg = thresholdConfigs?.[key];
      if (cfg?.showMin && seriesData['min']?.length) {
        const minVal = Math.min(...seriesData['min'].map(d => d.value[1]));
        newThresholdLines.push({ name: `${label} min`, value: minVal, color: cfg.minColor });
      }
      if (cfg?.showMax && seriesData['max']?.length) {
        const maxVal = Math.max(...seriesData['max'].map(d => d.value[1]));
        newThresholdLines.push({ name: `${label} max`, value: maxVal, color: cfg.maxColor });
      }
    }

    const firstKey = Object.keys(combined)[0];
    if (isZoom) {
      this.zoomedDataPointCount = combined[firstKey]?.length ?? 0;
      this.data = this.mergeZoomData(this.baseData, combined, dateFrom, dateTo);
    } else {
      this.baseData = combined;
      this.data = combined;
      this.baseDataPointCount = combined[firstKey]?.length ?? 0;
    }
    this.thresholdLines = newThresholdLines;
  }

  /**
   * Invoked when the user zooms in the chart.
   *
   * Loads higher-resolution data for the zoomed time range and updates the
   * x-axis formatter to use that range.
   */
  async onZoom(range: { dateFrom: Date; dateTo: Date }): Promise<void> {
    const id = this.config.device?.id;
    const datapoints = this.config.datapoints as KPIDetails[] | undefined;
    if (!id || !datapoints?.length) return;

    const fromMs = range.dateFrom.getTime();
    const toMs = range.dateTo.getTime();
    if (fromMs === this.lastZoomFrom && toMs === this.lastZoomTo) return;
    this.lastZoomFrom = fromMs;
    this.lastZoomTo = toMs;

    this.zoomedTimeRange = range;

    const fineInterval = this.aggregationService.computeAggregationInterval(range.dateFrom, range.dateTo);
    if (fineInterval === this.currentInterval) return;

    this.loading = true;
    try {
      this.currentInterval = fineInterval;
      this.zoomedInterval = fineInterval;
      await this.loadDatapoints(id, range.dateFrom, range.dateTo, fineInterval, datapoints, true);
    } catch (e) {
      console.error('Error loading zoomed data:', e);
    } finally {
      this.loading = false;
    }
  }

  /**
   * Merge zoomed-in data into the baseline full-range dataset.
   *
   * The baseline points inside the zoom range are replaced by the higher-
   * resolution points returned from the zoom query.
   */
  private mergeZoomData(
    base: LineChartData,
    zoomData: LineChartData,
    dateFrom: Date,
    dateTo: Date,
  ): LineChartData {
    const fromMs = dateFrom.getTime();
    const toMs = dateTo.getTime();
    const filterOut = (items: DataItem[]) =>
      items.filter((d) => {
        const t = d.value[0].getTime();
        return t < fromMs || t > toMs;
      });
    const sort = (items: DataItem[]) => items.sort((a, b) => a.value[0].getTime() - b.value[0].getTime());

    const merged: LineChartData = {};
    for (const key of Object.keys(zoomData)) {
      merged[key] = sort([...(filterOut(base[key] ?? [])), ...(zoomData[key] ?? [])]);
    }
    return merged;
  }

/**
   * Convert the raw Cumulocity series response into the chart-friendly
   * `LineChartData` structure.
   */
  private transformData(data: AggregatedISeries, functions: string[]): LineChartData {
    const series: LineChartData = {};
    for (const fn of functions) {
      series[fn] = [];
    }

    for (const [ts, entries] of Object.entries(data.values)) {
      const entry = entries[0];
      if (!entry) continue;
      const date = new Date(ts);

      for (const fn of functions) {
        const value = this.getEntryValue(entry, fn);
        if (value === undefined || value === null) continue;
        series[fn].push({ name: ts, value: [date, value] });
      }
    }

    console.log('Count', Object.fromEntries(functions.map((fn) => [fn, series[fn].length])));
    return series;
  }

  private getEntryValue(entry: AggregatedISeries['values'][string][0], fn: string): number | undefined {
    switch (fn) {
      case 'min':
        return entry.min;
      case 'max':
        return entry.max;
      case 'avg':
        // avg is provided by the server (aggregationFunction=AVG); fall back to
        // midpoint only if the API did not return it.
        return entry.avg ?? (entry.min + entry.max) * 0.5;
      case 'sum':
        return entry.sum;
      case 'count':
        return entry.count;
      case 'stdDevPop':
        return entry.stdDevPop;
      case 'stdDevSamp':
        return entry.stdDevSamp;
      default:
        return undefined;
    }
  }

  /**
   * Fetches measurement series data using the IndexedDB cache where possible.
   * Only time-range gaps not already covered by the cache are fetched from the
   * Cumulocity API; the results are stored back into the cache before the full
   * range is returned.
   *
   * Falls back to a direct API fetch if the cache is unavailable (e.g. private
   * browsing mode or a browser without IndexedDB support).
   */
  private async fetchWithCache(
    deviceId: string,
    series: string,
    agg: string,
    dateFrom: Date,
    dateTo: Date,
    functions: string[],
  ): Promise<AggregatedISeries> {
    try {
      const coverage = await this.cache.getCoverage(deviceId, series, agg);
      const gaps = this.cache.computeGaps(coverage, dateFrom, dateTo);

      const shortSeries = series.split('.').pop() ?? series;
      if (gaps.length === 0) {
        this.cacheLog.push(`✓ ${shortSeries}: fully cached`);
      } else {
        if (coverage.length > 0) {
          this.cacheLog.push(`↩ ${shortSeries}: ${coverage.length} cached interval(s) reused`);
        }
        this.cacheLog.push(`↓ ${shortSeries}: fetching ${gaps.length} gap(s) from API`);
      }

      await Promise.all(
        gaps.map(async gap => {
          const gapData = await this.chartData.fetchSeriesWithAggregation(
            deviceId, gap.from, gap.to, series, agg, functions,
          );
          await this.cache.storeRange(deviceId, series, agg, gap.from, gap.to, gapData);
        }),
      );

      return await this.cache.getRange(deviceId, series, agg, dateFrom, dateTo);
    } catch (e) {
      console.warn('MeasurementCacheService unavailable, falling back to direct fetch:', e);
      return this.chartData.fetchSeriesWithAggregation(
        deviceId, dateFrom, dateTo, series, agg, functions,
      );
    }
  }
}

