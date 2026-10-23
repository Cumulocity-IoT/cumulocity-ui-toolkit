import { ApplicationConfig, importProvidersFrom, provideZoneChangeDetection } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { CoreModule, RouterModule } from '@c8y/ngx-components';
import { CockpitDashboardModule } from '@c8y/ngx-components/context-dashboard/cockpit-home-dashboard';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection(),
    provideAnimations(),
    importProvidersFrom(RouterModule.forRoot()),
    importProvidersFrom(CoreModule.forRoot()),
    importProvidersFrom(CockpitDashboardModule),
  ],
};
