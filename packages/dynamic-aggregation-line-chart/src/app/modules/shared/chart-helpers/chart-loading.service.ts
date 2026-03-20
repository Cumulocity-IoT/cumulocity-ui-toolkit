import { EventEmitter, Injectable } from '@angular/core';
import { AggregatedISeries, ChartDataService } from './chart-data.service';
import { MeasurementCacheService } from './measurement-cache.service';

@Injectable()
export class ChartLoadingService {
  private change = new EventEmitter<AggregatedISeries>();
  result$ = this.change.asObservable();

  private zoomChange = new EventEmitter<AggregatedISeries>();
  zoomResult$ = this.zoomChange.asObservable();

  constructor(
    private chartData: ChartDataService,
    private cache: MeasurementCacheService
  ) {}

  /**
   * Loads measurement series for the given device, date range and datapoint
   * using the Cumulocity series API with explicit `aggregationFunction` and
   * `aggregationInterval` parameters.
   *
   * Strategy:
   * 1. Compute the smallest ISO 8601 interval that keeps points ≤ 5 000.
   * 2. Emit any already-cached data immediately for instant chart render.
   * 3. Fill only the uncached gaps from the API and persist them.
   * 4. Emit the complete merged dataset.
   *
   * Falls back to a direct API fetch if IndexedDB is unavailable.
   */
  async load(
    id: string,
    dateFrom: Date,
    dateTo: Date,
    series: string,
    interval: string,
    aggregationFunctions: string[],
    isZooming = false
  ): Promise<void> {
    console.warn(
      `Loading [${series}] interval=${interval} functions=${aggregationFunctions.join(',')}`
    );

    let coverage: { from: string; to: string }[] = [];
    let cached: AggregatedISeries = { values: {} };
    let cacheAvailable = true;

    try {
      [coverage, cached] = await Promise.all([
        this.cache.getCoverage(id, series, interval),
        this.cache.getRange(id, series, interval, dateFrom, dateTo),
      ]);
    } catch (cacheErr) {
      console.warn('IndexedDB unavailable, falling back to direct fetch:', cacheErr);
      cacheAvailable = false;
    }

    const useCache = aggregationFunctions.every((fn) => ['min', 'max', 'avg'].includes(fn));

    if (!cacheAvailable || !useCache) {
      try {
        const data = await this.chartData.fetchSeriesWithAggregation(
          id,
          dateFrom,
          dateTo,
          series,
          interval,
          aggregationFunctions
        );

        if (isZooming) {
          this.zoomChange.emit(data);
        } else {
          this.change.emit(data);
        }
      } catch (e) {
        if (isZooming) {
          this.zoomChange.error(e);
        } else {
          this.change.error(e);
        }
      }

      return;
    }

    // Emit cached data immediately so the chart renders without waiting for network.
    if (Object.keys(cached.values).length > 0) {
      this.notifyObservers(cached, false, isZooming);
    }

    const gaps = this.cache.computeGaps(coverage, dateFrom, dateTo);

    for (const gap of gaps) {
      console.warn(`Cache miss [${interval}] ${gap.from.toISOString()} → ${gap.to.toISOString()}`);

      try {
        const freshData = await this.chartData.fetchSeriesWithAggregation(
          id,
          gap.from,
          gap.to,
          series,
          interval,
          aggregationFunctions
        );

        await this.cache
          .storeRange(id, series, interval, gap.from, gap.to, freshData)
          .catch((e) => console.warn('Failed to persist cache entry:', e));
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
        const err = new Error(message ?? 'Unknown error');

        this.notifyObservers(err, true, isZooming);

        return;
      }
    }

    if (gaps.length > 0) {
      // Re-read the full window (old + newly stored) before final emit.
      try {
        const fullData = await this.cache.getRange(id, series, interval, dateFrom, dateTo);

        this.notifyObservers(fullData, false, isZooming);
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : typeof e === 'string' ? e : JSON.stringify(e);
        const err = new Error(message ?? 'Unknown error');

        this.notifyObservers(err, true, isZooming);
      }
    }
  }

  private notifyObservers(
    data: AggregatedISeries | Error,
    isError: boolean,
    isZooming: boolean
  ): void {
    if (isZooming) {
      if (isError) {
        this.zoomChange.error(data as Error);
      } else {
        this.zoomChange.emit(data as AggregatedISeries);
      }
    } else {
      if (isError) {
        this.change.error(data as Error);
      } else {
        this.change.emit(data as AggregatedISeries);
      }
    }
  }
}
