import { NgModule } from '@angular/core';
import { hookActionBar } from '@c8y/ngx-components';
import { IndexDbCacheActionFactory } from './index-db-cache-action/index-db-cache-action.factory';
import { DataModule } from '@c8y/ngx-components/api';
import { MeasurementInterceptorService } from './index-db-cache-action/services/measurement-interceptor.service';
import { NewSeriesInterceptorService } from './index-db-cache-action/services/new-series-interceptor.service';
import { OldSeriesInterceptorService } from './index-db-cache-action/services/old-series-interceptor.service';
import { ApiService } from '@c8y/ngx-components/api';

@NgModule({
  imports: [DataModule],
  providers: [hookActionBar(IndexDbCacheActionFactory)],
})
export class IndexDbCacheModule {
  constructor(
    api: ApiService,
    newSeries: NewSeriesInterceptorService,
    oldSeries: OldSeriesInterceptorService,
    measurement: MeasurementInterceptorService
  ) {
    /**
     * Each interceptor is registered under a unique name so it can be identified
     * in debug tooling:
     * - `indexDbCache.newSeries` — `/measurement/measurements/series` with `aggregationInterval`
     * - `indexDbCache.oldSeries` — `/measurement/measurements/series` with `aggregationType`
     * - `indexDbCache.measurement` — `/measurement/measurements` list endpoint
     */
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
