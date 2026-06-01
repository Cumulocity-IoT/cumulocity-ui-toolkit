/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-redundant-type-constituents, @typescript-eslint/no-unsafe-argument */
import { Observable, firstValueFrom, from } from 'rxjs';
import { IFetchResponse } from '@c8y/client';
import { ApiCall, HttpHandler } from '@c8y/ngx-components/api';
import { MeasurementInterceptorService } from './services/measurement-interceptor.service';
import { NewSeriesInterceptorService } from './services/new-series-interceptor.service';
import { OldSeriesInterceptorService } from './services/old-series-interceptor.service';

/** Minimal structural type representing an AngularJS `$http` request config. */
interface Ng1HttpConfig {
  url: string;
  method?: string;
  params?: Record<string, unknown>;
  headers?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Minimal structural type for the AngularJS `$q` deferred object. */
interface Ng1QDeferred<T> {
  promise: any;
  resolve(v: T): void;
  reject(r: unknown): void;
}

/** Minimal structural type for the AngularJS `$q` service. */
interface Ng1QService {
  defer<T>(): Ng1QDeferred<T>;
}

const SERIES_URL_FRAGMENT = 'measurement/measurements/series';
const MEASUREMENTS_URL_FRAGMENT = 'measurement/measurements';

/**
 * `HttpHandler` implementation that executes the underlying HTTP call via the
 * browser Fetch API.  Using `fetch()` directly avoids re-entering the
 * AngularJS `$http` interceptor chain and mirrors how the Angular `FetchClient`
 * works internally.
 */
class Ng1FetchHandler extends HttpHandler {
  constructor(private readonly baseConfig: Ng1HttpConfig) {
    super();
  }

  handle(req: ApiCall): Observable<IFetchResponse> {
    return from(this.doFetch(req));
  }

  private async doFetch(req: ApiCall): Promise<IFetchResponse> {
    const url = new URL(req.url, window.location.origin);
    const params = req.options?.params as Record<string, unknown> | undefined;

    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value != null) {
          url.searchParams.set(
            key,
            // eslint-disable-next-line @typescript-eslint/no-base-to-string
            typeof value === 'object' ? JSON.stringify(value) : String(value)
          );
        }
      }
    }

    return fetch(url.toString(), {
      method: req.method ?? 'GET',
      headers: (this.baseConfig.headers as HeadersInit | undefined) ?? {},
      credentials: 'include',
    });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

type AnyInterceptorService =
  | MeasurementInterceptorService
  | NewSeriesInterceptorService
  | OldSeriesInterceptorService;

function resolveInterceptor(
  url: string,
  params: Record<string, unknown>,
  newSeries: NewSeriesInterceptorService,
  oldSeries: OldSeriesInterceptorService,
  measurement: MeasurementInterceptorService
): AnyInterceptorService | null {
  if (url.includes(SERIES_URL_FRAGMENT)) {
    if (params['aggregationInterval']) return newSeries;

    if (params['aggregationType']) return oldSeries;

    return null;
  }

  if (url.includes(MEASUREMENTS_URL_FRAGMENT)) {
    return measurement;
  }

  return null;
}

function toApiCall(config: Ng1HttpConfig): ApiCall {
  return {
    url: config.url,
    method: (config.method ?? 'GET').toUpperCase(),
    options: { params: config.params ?? {} },
  };
}

/**
 * Builds a `$q` promise that runs the Angular interceptor chain for a given
 * `$http` config and resolves with an AngularJS-shaped response object.
 * Falls back to `fallback()` on any interceptor error.
 */
function buildInterceptedPromise(
  config: Ng1HttpConfig,
  $q: Ng1QService,
  interceptor: AnyInterceptorService,
  fallback: () => any
): any {
  const apiCall = toApiCall(config);
  const handler = new Ng1FetchHandler(config);
  const response$ = interceptor.intercept(apiCall, handler);
  const deferred = $q.defer<unknown>();

  firstValueFrom(response$)
    .then((fetchResponse: IFetchResponse) => fetchResponse.json())
    .then((data: unknown) => {
      deferred.resolve({ data, status: 200, statusText: 'OK', headers: () => null, config });
    })
    .catch(() => {
      // Fall through to the real $http call on any interceptor error.
      Promise.resolve(fallback()).then(
        (v) => deferred.resolve(v),
        (e) => deferred.reject(e)
      );
    });

  return deferred.promise;
}

// ─── Registration ─────────────────────────────────────────────────────────────

/**
 * Patches the AngularJS `$http` service to intercept measurement API calls
 * after AngularJS has already bootstrapped.
 *
 * `$httpProvider.interceptors` is config-phase-only and cannot be accessed via
 * `$injector.get()` post-bootstrap.  Instead, we obtain `$http` and `$q`
 * directly from the `$injector` (available via Angular's `inject('$injector')`
 * in the hybrid app) and wrap `$http.get` plus the direct `$http(config)` call
 * form so that our Angular interceptor services are consulted for every
 * measurement request made by AngularJS widgets.
 */
export function registerNg1HttpInterceptor(
  ng1Injector: any,
  newSeries: NewSeriesInterceptorService,
  oldSeries: OldSeriesInterceptorService,
  measurement: MeasurementInterceptorService
): void {
  const $http: any = ng1Injector.get('$http');
  const $q: Ng1QService = ng1Injector.get('$q');

  // ── Wrap $http.get(url, config) ────────────────────────────────────────────
  const originalGet: (url: string, config?: Ng1HttpConfig) => any = $http.get.bind($http);

  $http.get = function (url: string, config: Ng1HttpConfig = { url }) {
    if (!url?.includes(MEASUREMENTS_URL_FRAGMENT)) return originalGet(url, config);

    const fullConfig: Ng1HttpConfig = { ...config, url, method: 'GET' };
    const interceptor = resolveInterceptor(
      url,
      fullConfig.params ?? {},
      newSeries,
      oldSeries,
      measurement
    );

    if (!interceptor) return originalGet(url, config);

    return buildInterceptedPromise(fullConfig, $q, interceptor, () => originalGet(url, config));
  };

  // ── Wrap $http(config) direct calls ───────────────────────────────────────
  const originalHttp: (config: Ng1HttpConfig) => any = $http.bind(null);

  const patchedHttp: any = function (config: Ng1HttpConfig) {
    const method = (config.method ?? 'GET').toUpperCase();

    if (method !== 'GET' || !config.url?.includes(MEASUREMENTS_URL_FRAGMENT)) {
      return originalHttp(config);
    }

    const interceptor = resolveInterceptor(
      config.url,
      config.params ?? {},
      newSeries,
      oldSeries,
      measurement
    );

    if (!interceptor) return originalHttp(config);

    return buildInterceptedPromise(config, $q, interceptor, () => originalHttp(config));
  };

  // Copy all static properties ($http.get, $http.post, $http.defaults, etc.)
  // onto the patched wrapper so callers using $http.get() still work after
  // the wrapper itself is put in place.
  Object.assign(patchedHttp, $http);

  // Re-apply our wrapped .get so it isn't overwritten by the Object.assign above.
  patchedHttp.get = $http.get;

  // Replace the cached $http instance in the AngularJS injector cache so
  // future $injector.get('$http') calls return the patched version.
  const cache: Record<string, unknown> = ng1Injector['cache'] ?? {};

  cache['$http'] = patchedHttp;
}
