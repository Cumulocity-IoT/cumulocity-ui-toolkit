import {
  type EnvironmentProviders,
  inject,
  type Provider,
  provideEnvironmentInitializer,
} from '@angular/core';
import { hookActionBar } from '@c8y/ngx-components';
import { ApiService, provideClientLibServices } from '@c8y/ngx-components/api';
import { IndexDbCacheActionFactory } from './index-db-cache-action/index-db-cache-action.factory';
import { MeasurementInterceptorService } from './index-db-cache-action/services/measurement-interceptor.service';
import { NavigationAbortInterceptorService } from './index-db-cache-action/services/navigation-abort.service';
import { NewSeriesInterceptorService } from './index-db-cache-action/services/new-series-interceptor.service';
import { OldSeriesInterceptorService } from './index-db-cache-action/services/old-series-interceptor.service';

/**
 * The plugin: the action-bar item plus the measurement API interceptors.
 *
 * `provideClientLibServices()` gives the plugin its own `ApiService` (the client services
 * themselves are the shell's — see the SDK's `toProvider`). That `ApiService` wraps the shell's
 * `FetchClient.fetch`, so the interceptors below see every measurement request of the page —
 * the same setup the former `IndexDbCacheModule` (which imported `DataModule`) had.
 *
 * The environment initializer runs when the shell creates the plugin's injector
 * (`PluginsLoaderService.loadProviders` → `createEnvironmentInjector`).
 */
export const IndexDbCachePluginProviders: (Provider | EnvironmentProviders)[] = [
  ...provideClientLibServices(),
  hookActionBar(IndexDbCacheActionFactory),
  provideEnvironmentInitializer(() => {
    const api = inject(ApiService);

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
    api.addInterceptor(
      inject(NavigationAbortInterceptorService),
      '0.indexDbCache.abortOnNavigation'
    );
    api.addInterceptor(inject(NewSeriesInterceptorService), 'indexDbCache.newSeries');
    api.addInterceptor(inject(OldSeriesInterceptorService), 'indexDbCache.oldSeries');
    api.addInterceptor(inject(MeasurementInterceptorService), 'indexDbCache.measurement');
  }),
];
