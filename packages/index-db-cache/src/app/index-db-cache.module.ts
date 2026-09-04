import { NgModule } from '@angular/core';
import { hookActionBar } from '@c8y/ngx-components';
import { IndexDbCacheActionFactory } from './index-db-cache-action/index-db-cache-action.factory';
import { DataModule } from '@c8y/ngx-components/api';
import { MeasurementInterceptorService } from './index-db-cache-action/services/measurement-interceptor.service';
import { NewSeriesInterceptorService } from './index-db-cache-action/services/new-series-interceptor.service';
import { OldSeriesInterceptorService } from './index-db-cache-action/services/old-series-interceptor.service';
import { NavigationAbortInterceptorService } from './index-db-cache-action/services/navigation-abort.service';
import { ApiService } from '@c8y/ngx-components/api';

@NgModule({
  imports: [DataModule],
  providers: [hookActionBar(IndexDbCacheActionFactory)],
})
export class IndexDbCacheModule {
  constructor(
    api: ApiService,
    navigationAbort: NavigationAbortInterceptorService,
    newSeries: NewSeriesInterceptorService,
    oldSeries: OldSeriesInterceptorService,
    measurement: MeasurementInterceptorService
  ) {
    /**
     * Each interceptor is registered under a unique name so it can be identified
     * in debug tooling:
     * - `0.indexDbCache.abortOnNavigation` — attaches the navigation `AbortSignal`
     * - `indexDbCache.newSeries` — `/measurement/measurements/series` with `aggregationInterval`
     * - `indexDbCache.oldSeries` — `/measurement/measurements/series` with `aggregationType`
     * - `indexDbCache.measurement` — `/measurement/measurements` list endpoint
     *
     * `ApiService` sorts interceptor ids descending and wraps the chain from the
     * inside out, so the *lowest* id ends up outermost and runs first. The abort
     * interceptor needs that position: the cache interceptors fan out their own
     * gap-fill requests through `next.handle()`, and those should inherit the
     * signal rather than outlive the navigation.
     */
    api.addInterceptor(navigationAbort, '0.indexDbCache.abortOnNavigation');
    api.addInterceptor(newSeries, 'indexDbCache.newSeries');
    api.addInterceptor(oldSeries, 'indexDbCache.oldSeries');
    api.addInterceptor(measurement, 'indexDbCache.measurement');
  }
}

/**
 * In 1023 do it like this - 
 * export function provideClientInterceptorSample() {
  return [
    provideAppInitializer(() => {
      const initializerFn = ((apiService: ApiService, interceptor: ClientInterceptorService) => {
        return () => {
          apiService.addInterceptor(interceptor, 'tutorialAppDemoInterceptor');
        };
      })(inject(ApiService), inject(ClientInterceptorService));
      return initializerFn();
    })
  ] satisfies (Provider | EnvironmentProviders)[];
}
 */
