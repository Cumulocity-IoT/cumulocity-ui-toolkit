import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { CoreModule, RouterModule } from '@c8y/ngx-components';
import { CockpitDashboardModule } from '@c8y/ngx-components/context-dashboard/cockpit-home-dashboard';
import { FormlyModule } from '@ngx-formly/core';
import { AssetFieldType } from '~components/_formly-fields/asset-formly/asset-formly.component';
import { TimeFieldType } from '~components/_formly-fields/time-formly/time-formly.component';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    importProvidersFrom(RouterModule.forRoot()),
    importProvidersFrom(CoreModule.forRoot()),
    importProvidersFrom(CockpitDashboardModule),
    importProvidersFrom(
      FormlyModule.forRoot({
        types: [
          { name: 'time', component: TimeFieldType },
          { name: 'asset', component: AssetFieldType },
        ],
      })
    ),
  ],
};
