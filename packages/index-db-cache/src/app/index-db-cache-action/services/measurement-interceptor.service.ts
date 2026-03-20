import { Injectable } from '@angular/core';
import { IFetchResponse } from '@c8y/client';
import { ApiCall, HttpHandler, HttpInterceptor } from '@c8y/ngx-components/api';
import { Observable, firstValueFrom, from } from 'rxjs';
import { CumulocityMeasurement, MeasurementCollection } from './chart-data.service';
import { CacheLogService } from './cache-log.service';
import { CacheStateService } from './cache-state.service';
import { MeasurementCacheService } from './measurement-cache.service';
import { get, has } from 'lodash';

/**
 * Minimum milliseconds that must separate `dateTo` from the current time for a
 * request to be considered historical and thus eligible for caching.
 */
const MIN_HISTORICAL_MS = 5 * 60_000;

/**
 * Minimum `pageSize` value required for a request to be cached. Smaller page
 * sizes indicate the caller is doing pagination / incremental fetching where
 * the cache cannot guarantee completeness of any given window.
 */
const MIN_ELIGIBLE_PAGE_SIZE = 100;

interface MeasurementParams {
  source: string;
  dateFrom: Date;
  dateTo: Date;
  /** `valueFragmentType` query param, or empty string if absent. */
  fragmentType: string;
  /** `valueFragmentSeries` query param, or empty string if absent. */
  fragmentSeries: string;
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

// ─── Interceptor ──────────────────────────────────────────────────────────────

/**
 * HTTP interceptor that caches `/measurement/measurements` list responses in
 * IndexedDB via {@link MeasurementCacheService}.
 *
 * **Eligibility criteria:**
 * - GET method
 * - URL path ends with `/measurement/measurements` (not the `/series` variant)
 * - Has `source`, `dateFrom`, and `dateTo` query parameters
 * - `pageSize` ≥ {@link MIN_ELIGIBLE_PAGE_SIZE} (high page size signals a bulk
 *   historical download rather than incremental real-time polling)
 * - `dateTo` is at least {@link MIN_HISTORICAL_MS} in the past
 *
 * **Pagination guard:** If an API response for any gap window is paginated
 * (contains a `next` link), the gap is not cached and the original request is
 * forwarded unmodified so the caller receives the complete, real API response.
 * This prevents partial data from poisoning the cache.
 */
@Injectable({ providedIn: 'root' })
export class MeasurementInterceptorService implements HttpInterceptor {
  constructor(
    private readonly cache: MeasurementCacheService,
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

  private tryParseParams(req: ApiCall): MeasurementParams | null {
    if (!req.url.endsWith('measurement/measurements')) return null;

    const params = req.options?.params;

    if (!params || !has(params, 'dateFrom') || !has(params, 'dateTo')) return null;

    // Match the list endpoint only — the series endpoint ends with /series

    const source = get(params, 'source') as string;
    const dateFromStr = get(params, 'dateFrom') as string;
    const dateToStr = get(params, 'dateTo') as string;
    const pageSizeStr = get(params, 'pageSize') as string;

    if (!source || !dateFromStr || !dateToStr) return null;

    const pageSize = pageSizeStr ? +pageSizeStr : null;

    if (pageSize === null || pageSize < MIN_ELIGIBLE_PAGE_SIZE) return null;

    const dateFrom = new Date(dateFromStr);
    const dateTo = new Date(dateToStr);

    if (isNaN(dateFrom.getTime()) || isNaN(dateTo.getTime())) return null;

    if (Date.now() - dateFrom.getTime() < MIN_HISTORICAL_MS) return null;

    return {
      source,
      dateFrom,
      dateTo,
      fragmentType: get(params, 'valueFragmentType') ?? '',
      fragmentSeries: get(params, 'valueFragmentSeries') ?? '',
    };
  }

  // ─── Cache-aware request handling ─────────────────────────────────────────────

  private async handleWithCache(
    params: MeasurementParams,
    req: ApiCall,
    next: HttpHandler
  ): Promise<IFetchResponse> {
    const { source, dateFrom, dateTo, fragmentType, fragmentSeries } = params;

    // 1. Compute uncached gaps for this source / fragment combination
    const coverage = await this.cache.getCoverage(source, fragmentType, fragmentSeries);
    const gaps = this.cache.computeGaps(coverage, dateFrom, dateTo);

    // 2. Fetch all gaps and collect results before writing to cache.
    //    If any gap response is paginated, the window is incomplete — fall back
    //    to the real API call rather than caching partial data.
    const gapResults: { measurements: CumulocityMeasurement[]; gap: { from: Date; to: Date } }[] =
      [];
    let fetchedBytes = 0;

    for (const gap of gaps) {
      const gapReq = cloneWithDates(req, gap.from, gap.to);
      let apiResp: IFetchResponse;

      try {
        apiResp = await firstValueFrom(next.handle(gapReq));
      } catch {
        return firstValueFrom(next.handle(req));
      }
      if (!apiResp.ok) return apiResp;

      const body: MeasurementCollection = await apiResp.json();

      // Paginated response — cannot guarantee coverage of the full gap window
      if (body.next) {
        return firstValueFrom(next.handle(req));
      }

      fetchedBytes += JSON.stringify(body).length;
      gapResults.push({ measurements: body.measurements ?? [], gap });
    }

    // 3. All gaps were fetched completely — commit to cache
    for (const { gap, measurements } of gapResults) {
      await this.cache.storeRange(
        source,
        fragmentType,
        fragmentSeries,
        gap.from,
        gap.to,
        measurements
      );
    }

    // 4. Serve the full requested range from cache (timed)
    const idbStart = performance.now();
    const cached = await this.cache.getRange(
      source,
      fragmentType,
      fragmentSeries,
      dateFrom,
      dateTo
    );
    const idbReadMs = Math.round(performance.now() - idbStart);

    // Sort by time ascending (consistent with the default API ordering)
    cached.sort((a, b) => a.time.localeCompare(b.time));

    const responseBody: MeasurementCollection = {
      measurements: cached,
      statistics: {
        pageSize: cached.length,
        currentPage: 1,
        totalPages: 1,
      },
    };
    const cachedBytes = JSON.stringify(responseBody).length;

    const keys = [
      fragmentType && fragmentSeries
        ? `${fragmentType}.${fragmentSeries}`
        : fragmentType || fragmentSeries,
    ].filter(Boolean);

    this.logService.push({
      cache: 'measurement',
      eventType: gaps.length === 0 ? 'cache-hit' : 'partial-cache',
      source,
      dateFrom,
      dateTo,
      keys,
      gapCount: gaps.length,
      idbReadMs,
      cachedBytes,
      fetchedBytes,
    });

    return buildFakeResponse(responseBody, req.url);
  }
}
