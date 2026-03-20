import { Injectable } from '@angular/core';
import { IFetchResponse } from '@c8y/client';
import { ApiCall, HttpHandler, HttpInterceptor } from '@c8y/ngx-components/api';
import { Observable, firstValueFrom, from } from 'rxjs';
import { get, has } from 'lodash';
import { AggregatedISeries, SeriesDataPoint, SeriesResponse } from './chart-data.service';
import { CacheLogService } from './cache-log.service';
import { CacheStateService } from './cache-state.service';
import { LegacyAggType, OldSeriesCacheService } from './old-series-cache.service';

/** Minimum milliseconds before `dateTo` relative to `now` to qualify for caching. */
const MIN_HISTORICAL_MS = 5 * 60_000;

const VALID_AGG_TYPES = new Set<string>(['DAILY', 'HOURLY', 'MINUTELY']);

/** Bucket width in milliseconds for each supported legacy aggregation type. */
const AGG_TYPE_MS: Record<string, number> = {
  MINUTELY: 60_000,
  HOURLY: 3_600_000,
  DAILY: 86_400_000,
};

interface OldSeriesParams {
  source: string;
  dateFrom: Date;
  dateTo: Date;
  aggregationType: LegacyAggType;
  seriesKeys: string[];
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function cloneWithDates(req: ApiCall, from: Date, to: Date): ApiCall {
  return {
    ...req,
    options: {
      ...req.options,
      params: {
        ...req.options?.params,
        dateFrom: from.toISOString(),
        dateTo: to.toISOString(),
      },
    },
  };
}

function buildFakeResponse(body: unknown, url: string): IFetchResponse {
  const jsonStr = JSON.stringify(body);
  return {
    ok: true,
    status: 200,
    url,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(jsonStr),
  } as unknown as IFetchResponse;
}

function mergeGaps(gaps: { from: Date; to: Date }[]): { from: Date; to: Date }[] {
  if (!gaps.length) return [];
  gaps.sort((a, b) => a.from.getTime() - b.from.getTime());
  const merged: { from: Date; to: Date }[] = [{ from: gaps[0].from, to: gaps[0].to }];

  for (let i = 1; i < gaps.length; i++) {
    const last = merged[merged.length - 1];
    const curr = gaps[i];

    if (curr.from.getTime() <= last.to.getTime()) {
      if (curr.to.getTime() > last.to.getTime()) last.to = curr.to;
    } else {
      merged.push({ from: curr.from, to: curr.to });
    }
  }

  return merged;
}

// ─── Interceptor ──────────────────────────────────────────────────────────────

/**
 * HTTP interceptor that caches `/measurement/measurements/series` responses
 * keyed by `aggregationType` (DAILY | HOURLY | MINUTELY) in IndexedDB via
 * {@link OldSeriesCacheService}.
 *
 * This endpoint predates the `aggregationInterval` API. Requests using
 * `aggregationType` are distinct from those using `aggregationInterval` and
 * are cached independently.
 *
 * Eligibility is identical to {@link NewSeriesInterceptorService}:
 * - GET method with `source`, `dateFrom`, `dateTo`, and at least one `series` key
 * - `dateFrom` at least {@link MIN_HISTORICAL_MS} in the past
 * - `aggregationType` must be `DAILY`, `HOURLY`, or `MINUTELY`
 */
@Injectable({ providedIn: 'root' })
export class OldSeriesInterceptorService implements HttpInterceptor {
  /** In-memory store for `series` metadata returned by the API. */
  private readonly metaCache = new Map<string, SeriesResponse['series']>();

  constructor(
    private readonly cache: OldSeriesCacheService,
    private readonly cacheState: CacheStateService,
    private readonly logService: CacheLogService
  ) {}

  intercept(req: ApiCall, next: HttpHandler): Observable<IFetchResponse> {
    if (!this.cacheState.isActive) return next.handle(req);

    const params = this.tryParseParams(req);

    if (!params) return next.handle(req);

    return from(this.handleWithCache(params, req, next));
  }

  // ─── Eligibility parsing ──────────────────────────────────────────────────────

  private tryParseParams(req: ApiCall): OldSeriesParams | null {
    if (!req.url.endsWith('measurement/measurements/series')) return null;

    const params = req.options?.params;

    if (
      !params ||
      !has(params, 'source') ||
      !has(params, 'dateFrom') ||
      !has(params, 'dateTo') ||
      !has(params, 'aggregationType') ||
      !has(params, 'series')
    ) {
      return null;
    }

    const source = get(params, 'source') as string;
    const dateFromStr = get(params, 'dateFrom') as string;
    const dateToStr = get(params, 'dateTo') as string;
    const aggregationType = get(params, 'aggregationType') as string;
    const seriesRaw = get(params, 'series');
    const seriesKeys = Array.isArray(seriesRaw)
      ? (seriesRaw as string[])
      : seriesRaw
        ? [seriesRaw as string]
        : [];

    if (
      !source ||
      !dateFromStr ||
      !dateToStr ||
      !aggregationType ||
      !VALID_AGG_TYPES.has(aggregationType) ||
      !seriesKeys.length
    ) {
      return null;
    }

    // Requests with aggregationInterval take precedence — let NewSeriesInterceptor handle them
    if (has(params, 'aggregationInterval')) return null;

    const dateFrom = new Date(dateFromStr);
    const dateTo = new Date(dateToStr);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) return null;

    if (Date.now() - dateFrom.getTime() < MIN_HISTORICAL_MS) return null;

    return {
      source,
      dateFrom,
      dateTo,
      aggregationType: aggregationType as LegacyAggType,
      seriesKeys,
    };
  }

  // ─── Cache-aware request handling ─────────────────────────────────────────────

  private async handleWithCache(
    params: OldSeriesParams,
    req: ApiCall,
    next: HttpHandler
  ): Promise<IFetchResponse> {
    const { source, dateFrom, dateTo, aggregationType, seriesKeys } = params;
    const metaKey = `${source}|${[...seriesKeys].sort().join(',')}|${aggregationType}`;
    let fetchedBytes = 0;

    // 1. Union of uncached gaps across all series
    const gaps = await this.computeUnionGaps(source, seriesKeys, aggregationType, dateFrom, dateTo);

    // 2. Fetch each gap from the API
    for (const gap of gaps) {
      // Skip gaps narrower than one aggregation bucket — the API would return no
      // data points for them anyway, and fetching would just add latency.
      if (gap.to.getTime() - gap.from.getTime() < (AGG_TYPE_MS[aggregationType] ?? 0)) {
        this.logService.push({
          cache: 'old-series',
          eventType: 'gap-skipped',
          source,
          dateFrom: gap.from,
          dateTo: gap.to,
          keys: seriesKeys,
          gapCount: 1,
          idbReadMs: 0,
          cachedBytes: 0,
          fetchedBytes: 0,
        });
        continue;
      }

      const gapReq = cloneWithDates(req, gap.from, gap.to);
      let apiResp: IFetchResponse;

      try {
        apiResp = await firstValueFrom(next.handle(gapReq));
      } catch {
        return firstValueFrom(next.handle(req));
      }
      if (!apiResp.ok) return apiResp;

      const body: SeriesResponse = await apiResp.json();

      if (body.truncated) return firstValueFrom(next.handle(req));

      if (body.series?.length) {
        this.metaCache.set(metaKey, body.series);
      }

      fetchedBytes += JSON.stringify(body).length;

      await this.storeAllSeries(body, source, seriesKeys, aggregationType, gap.from, gap.to);
    }

    // 3. Reconstruct multi-series response from cache (timed)
    const idbStart = performance.now();
    const cachedValues: Record<string, SeriesDataPoint[]> = {};

    for (let i = 0; i < seriesKeys.length; i++) {
      const rangeData = await this.cache.getRange(
        source,
        seriesKeys[i],
        aggregationType,
        dateFrom,
        dateTo
      );

      for (const [ts, pts] of Object.entries(rangeData.values)) {
        if (!cachedValues[ts]) {
          cachedValues[ts] = new Array(seriesKeys.length).fill(null);
        }
        cachedValues[ts][i] = pts[0] ?? null;
      }
    }
    const idbReadMs = Math.round(performance.now() - idbStart);

    const responseBody: SeriesResponse = {
      values: cachedValues,
      series: this.metaCache.get(metaKey) ?? [],
      truncated: false,
    };
    const cachedBytes = JSON.stringify(responseBody).length;

    this.logService.push({
      cache: 'old-series',
      eventType: gaps.length === 0 ? 'cache-hit' : 'partial-cache',
      source,
      dateFrom,
      dateTo,
      keys: seriesKeys,
      gapCount: gaps.length,
      idbReadMs,
      cachedBytes,
      fetchedBytes,
    });

    return buildFakeResponse(responseBody, req.url);
  }

  // ─── Gap computation ──────────────────────────────────────────────────────────

  private async computeUnionGaps(
    source: string,
    seriesKeys: string[],
    aggType: LegacyAggType,
    dateFrom: Date,
    dateTo: Date
  ): Promise<{ from: Date; to: Date }[]> {
    const allGaps: { from: Date; to: Date }[] = [];

    for (const s of seriesKeys) {
      const coverage = await this.cache.getCoverage(source, s, aggType);

      allGaps.push(...this.cache.computeGaps(coverage, dateFrom, dateTo));
    }

    return mergeGaps(allGaps);
  }

  // ─── Cache storage ────────────────────────────────────────────────────────────

  private async storeAllSeries(
    body: SeriesResponse,
    source: string,
    seriesKeys: string[],
    aggType: LegacyAggType,
    from: Date,
    to: Date
  ): Promise<void> {
    for (let i = 0; i < seriesKeys.length; i++) {
      const perSeries: AggregatedISeries = { values: {} };

      for (const [ts, pts] of Object.entries(body.values)) {
        const pt = pts[i];

        if (pt != null) {
          perSeries.values[ts] = [pt];
        }
      }
      await this.cache.storeRange(source, seriesKeys[i], aggType, from, to, perSeries);
    }
  }
}
