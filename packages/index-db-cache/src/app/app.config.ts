import {
  type ApplicationConfig,
  importProvidersFrom,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { CoreModule, RouterModule } from '@c8y/ngx-components';
import { IndexDbCachePluginProviders } from './index-db-cache.providers';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideAnimations(),
    importProvidersFrom(RouterModule.forRoot()),
    importProvidersFrom(CoreModule.forRoot()),
    // Registers the action-bar item and the measurement API interceptors.
    ...IndexDbCachePluginProviders,
  ],
};
