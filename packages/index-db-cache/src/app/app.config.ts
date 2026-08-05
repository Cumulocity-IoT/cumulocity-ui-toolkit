import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { CoreModule, RouterModule } from '@c8y/ngx-components';
import { IndexDbCacheModule } from './index-db-cache.module';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    importProvidersFrom(RouterModule.forRoot()),
    importProvidersFrom(CoreModule.forRoot()),
    // Registers the action-bar item and the measurement API interceptors.
    importProvidersFrom(IndexDbCacheModule),
  ],
};
