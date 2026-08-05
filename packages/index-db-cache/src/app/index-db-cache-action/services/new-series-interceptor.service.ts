import { Injectable } from '@angular/core';
import { IFetchResponse } from '@c8y/client';
import { ApiCall, HttpHandler, HttpInterceptor } from '@c8y/ngx-components/api';
import { Observable, firstValueFrom, from } from 'rxjs';
import { get, has } from 'lodash';
import { AggregatedISeries, SeriesDataPoint, SeriesResponse } from './chart-data.service';
import { CacheLogService } from './cache-log.service';
import {
  MIN_HISTORICAL_MS,
  clampCoverageTo,
  orderValues,
  responseColumnKeys,
} from './interceptor-helpers';
import { CacheStateService } from './cache-state.service';
import { AggKey, NewSeriesCacheService } from './new-series-cache.service';

/** Milliseconds per Cumulocity `aggregationInterval` unit letter. */
const INTERVAL_UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 7 * 86_400_000,
  M: 30.44 * 86_400_000,
  q: 3 * 30.44 * 86_400_000,
  y: 365.25 * 86_400_000,
};

/**
 * Parses a Cumulocity `aggregationInterval` value into milliseconds.
 *
 * The API format (per the C8Y OpenAPI spec) is a positive integer (1–999,
 * no leading zeros) followed by a unit letter: `s`, `m`, `h`, `d`, `w`,
 * `M` (month), `q` (quarter), `y` — e.g. `"300s"`, `"25m"`, `"12h"`, `"7d"`.
 * ISO 8601 durations (`"PT1H"`, `"P1D"`) are also accepted for robustness.
 * Any unrecognised format returns `0`.
 */
export function aggregationIntervalMs(interval: string): number {
  const c8y = interval.match(/^([1-9]\d{0,2})([smhdwMqy])$/);

  if (c8y) return +c8y[1] * INTERVAL_UNIT_MS[c8y[2]];

  const iso = interval.match(
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/
  );

  if (!iso) return 0;

  const [
    ,
    years = '0',
    months = '0',
    weeks = '0',
    days = '0',
    hours = '0',
    minutes = '0',
    seconds = '0',
  ] = iso;

  return (
    +years * INTERVAL_UNIT_MS['y'] +
    +months * INTERVAL_UNIT_MS['M'] +
    +weeks * INTERVAL_UNIT_MS['w'] +
    +days * INTERVAL_UNIT_MS['d'] +
    +hours * INTERVAL_UNIT_MS['h'] +
    +minutes * INTERVAL_UNIT_MS['m'] +
    +seconds * 1_000
  );
}

interface SeriesParams {
  source: string;
  dateFrom: Date;
  dateTo: Date;
  aggregationInterval: string;
  /**
   * Cache partition key: the aggregation interval, plus the sorted
   * `aggregationFunction` set when present. Responses for different function
   * sets contain different value fields and must never share cache entries.
   */
  aggKey: AggKey;
  /** `"fragment.series"` strings from repeated `series=` query params. */
  seriesKeys: string[];
}

// ─── Pure helpers (module-level so they can be shared without an extra class) ──

/**
 * Returns a shallow clone of `req` with `dateFrom` and `dateTo` replaced in
 * the URL. Handles both absolute and root-relative URLs.
 */
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

/**
 * Wraps a plain body object in a minimal {@link IFetchResponse}-compatible
 * object so the interceptor can return synthesized responses from cache.
 */
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

/**
 * Sorts and merges a list of possibly-overlapping gap windows into the minimal
 * set of non-overlapping intervals. Input windows may come from different series.
 */
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
 * keyed by `aggregationInterval` (and `aggregationFunction` set, when present)
 * in IndexedDB via {@link NewSeriesCacheService}.
 *
 * Only eligible requests are intercepted:
 * - GET method
 * - Has `source`, `dateFrom`, `dateTo`, `aggregationInterval`, and at least one
 *   `series` query parameter
 * - `dateFrom` is at least {@link MIN_HISTORICAL_MS} in the past (not a live query)
 *
 * Requests that fail the eligibility check are passed through unchanged.
 * Truncated API responses (where `truncated: true`) are returned as-is without
 * being stored, because the data window is incomplete.
 *
 * Series metadata (`unit`, `name`, `type`) is kept in an in-memory map so that
 * fully-cached responses (no API calls needed) can still include it.
 */
@Injectable({ providedIn: 'root' })
export class NewSeriesInterceptorService implements HttpInterceptor {
  /**
   * In-memory store for series metadata returned by the API, keyed by
   * `source|aggKey|type.name` so fully-cached responses can be served with
   * metadata in the correct per-column order.
   */
  private readonly metaCache = new Map<string, SeriesResponse['series'][number]>();

  constructor(
    private readonly cache: NewSeriesCacheService,
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

  private tryParseParams(req: ApiCall): SeriesParams | null {
    if (!req.url.endsWith('measurement/measurements/series')) return null;

    const params = req.options?.params;

    if (!params || !has(params, 'source') || !has(params, 'dateFrom') || !has(params, 'dateTo'))
      return null;

    const source = get(params, 'source') as string;
    const dateFromStr = get(params, 'dateFrom') as string;
    const dateToStr = get(params, 'dateTo') as string;
    const aggregationInterval = get(params, 'aggregationInterval') as string;
    const seriesRaw = get(params, 'series');
    const seriesKeys = Array.isArray(seriesRaw)
      ? (seriesRaw as string[])
      : seriesRaw
        ? [seriesRaw as string]
        : [];

    if (!source || !dateFromStr || !dateToStr || !aggregationInterval || !seriesKeys.length) {
      return null;
    }

    const dateFrom = new Date(dateFromStr);
    const dateTo = new Date(dateToStr);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) return null;

    if (Date.now() - dateFrom.getTime() < MIN_HISTORICAL_MS) return null;

    // aggregationFunction selects which value fields (min/max/avg/sum/…) the
    // API computes per bucket, so it must partition the cache: fold the sorted
    // function set into the cache key.
    const fnRaw = get(params, 'aggregationFunction');
    const fns = (Array.isArray(fnRaw) ? (fnRaw as string[]) : fnRaw ? [fnRaw as string] : [])
      .slice()
      .sort();
    const aggKey = fns.length ? `${aggregationInterval}|${fns.join(',')}` : aggregationInterval;

    return { source, dateFrom, dateTo, aggregationInterval, aggKey, seriesKeys };
  }

  // ─── Cache-aware request handling ─────────────────────────────────────────────

  private async handleWithCache(
    params: SeriesParams,
    req: ApiCall,
    next: HttpHandler
  ): Promise<IFetchResponse> {
    const { source, dateFrom, dateTo, aggregationInterval, aggKey, seriesKeys } = params;
    let fetchedBytes = 0;

    // 1. Compute union of uncached gaps across all requested series
    const gaps = await this.computeUnionGaps(source, seriesKeys, aggKey, dateFrom, dateTo);

    // 2. Fetch each gap from the API and populate the cache
    for (const gap of gaps) {
      // Skip gaps narrower than one aggregation bucket — the API would return no
      // data points for them anyway, and fetching would just add latency.
      if (gap.to.getTime() - gap.from.getTime() < aggregationIntervalMs(aggregationInterval)) {
        this.logService.push({
          cache: 'new-series',
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
        // On unexpected error fall back to the original request
        return firstValueFrom(next.handle(req));
      }
      if (!apiResp.ok) return apiResp;

      const body = (await apiResp.json()) as SeriesResponse;

      // Truncated response: the window is not fully covered — skip caching and
      // return the raw API response for the original date range.
      if (body.truncated) return firstValueFrom(next.handle(req));

      // Cache per-series metadata for future fully-cached responses
      if (body.series?.length) {
        for (const meta of body.series) {
          this.metaCache.set(`${source}|${aggKey}|${meta.type}.${meta.name}`, meta);
        }
      }

      fetchedBytes += JSON.stringify(body).length;

      await this.storeAllSeries(body, source, seriesKeys, aggKey, gap.from, gap.to);
    }

    // 3. Reconstruct the multi-series response from cache (timed).
    //    The API returns the grid bucket CONTAINING dateFrom (buckets are
    //    absolute-grid aligned, verified against a live tenant), so the read
    //    window is extended one bucket below dateFrom to match.
    const bucketMs = aggregationIntervalMs(aggregationInterval);
    const readFrom = new Date(dateFrom.getTime() - Math.max(bucketMs - 1, 0));
    const idbStart = performance.now();
    const cachedValues: Record<string, SeriesDataPoint[]> = {};

    for (let i = 0; i < seriesKeys.length; i++) {
      const rangeData = await this.cache.getRange(source, seriesKeys[i], aggKey, readFrom, dateTo);

      for (const [ts, pts] of Object.entries(rangeData.values)) {
        if (!cachedValues[ts]) {
          cachedValues[ts] = new Array(seriesKeys.length).fill(null) as SeriesDataPoint[];
        }
        cachedValues[ts][i] = pts[0] ?? null;
      }
    }
    const idbReadMs = Math.round(performance.now() - idbStart);

    // Response `series[i]` must describe `values[ts][i]`, i.e. follow the
    // column order used above (seriesKeys). Serve metadata only when it is
    // complete — a partial array would misalign the correspondence.
    const metas = seriesKeys.map((k) => this.metaCache.get(`${source}|${aggKey}|${k}`));
    const responseBody: SeriesResponse = {
      values: orderValues(cachedValues),
      series: metas.every(Boolean) ? metas : [],
      truncated: false,
    };
    const cachedBytes = JSON.stringify(responseBody).length;

    // 4. Emit log entry
    this.logService.push({
      cache: 'new-series',
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

  /**
   * Returns the union of all uncached sub-intervals across every requested series.
   * A window is included in the result if ANY series lacks coverage for it, because
   * a gap fetch must retrieve all series simultaneously.
   */
  private async computeUnionGaps(
    source: string,
    seriesKeys: string[],
    agg: AggKey,
    dateFrom: Date,
    dateTo: Date
  ): Promise<{ from: Date; to: Date }[]> {
    const allGaps: { from: Date; to: Date }[] = [];

    for (const s of seriesKeys) {
      const coverage = await this.cache.getCoverage(source, s, agg);

      allGaps.push(...this.cache.computeGaps(coverage, dateFrom, dateTo));
    }

    return mergeGaps(allGaps);
  }

  // ─── Cache storage ────────────────────────────────────────────────────────────

  /**
   * Decomposes the multi-series API response and stores each series individually
   * so they can be retrieved independently in future requests.
   *
   * `body.values[ts]` is an ordered array, one {@link SeriesDataPoint} per entry
   * of the response's `series` array — the column keys are derived from
   * `body.series`, falling back to the request order only when metadata is absent.
   *
   * Coverage is clamped to `now - MIN_HISTORICAL_MS`: the live edge of the
   * window is stored as data but never marked covered, so the next request
   * refetches it and picks up late-arriving measurements.
   */
  private async storeAllSeries(
    body: SeriesResponse,
    source: string,
    seriesKeys: string[],
    agg: AggKey,
    from: Date,
    to: Date
  ): Promise<void> {
    const columnKeys = responseColumnKeys(body, seriesKeys);
    const coverageTo = clampCoverageTo(from, to);

    for (let i = 0; i < columnKeys.length; i++) {
      const perSeries: AggregatedISeries = { values: {} };

      for (const [ts, pts] of Object.entries(body.values)) {
        const pt = pts[i];

        if (pt != null) {
          perSeries.values[ts] = [pt];
        }
      }
      await this.cache.storeRange(source, columnKeys[i], agg, from, coverageTo, perSeries);
    }
  }
}
