import { createEnvironmentInjector, EnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FetchClient } from '@c8y/client';
import { ApiService } from '@c8y/ngx-components/api';
import { IndexDbCachePluginProviders } from './index-db-cache.providers';
import { indexDbCacheModule } from './index';

describe('IndexDbCachePluginProviders', () => {
  it('registers the four measurement interceptors when the shell loads the plugin', () => {
    const addInterceptor = spyOn(ApiService.prototype, 'addInterceptor');

    TestBed.configureTestingModule({
      providers: [{ provide: FetchClient, useValue: { fetch: () => Promise.resolve({}) } }],
    });

    // what the shell does with a plugin's provider array (`PluginsLoaderService.loadProviders`)
    createEnvironmentInjector(IndexDbCachePluginProviders, TestBed.inject(EnvironmentInjector));

    expect(addInterceptor.calls.allArgs().map(([, id]) => id)).toEqual([
      '0.indexDbCache.abortOnNavigation',
      'indexDbCache.newSeries',
      'indexDbCache.oldSeries',
      'indexDbCache.measurement',
    ]);
  });

  it('keeps the exposed name installed applications reference', () => {
    expect(indexDbCacheModule).toBe(IndexDbCachePluginProviders);
  });
});
