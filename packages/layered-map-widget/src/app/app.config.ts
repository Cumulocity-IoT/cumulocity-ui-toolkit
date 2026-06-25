import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideAnimations } from '@angular/platform-browser/animations';
import { CoreModule, RouterModule } from '@c8y/ngx-components';
import { CockpitDashboardModule } from '@c8y/ngx-components/context-dashboard/cockpit-home-dashboard';
import { FormlyModule } from '@ngx-formly/core';
import { RelativeDateTypeComponent } from '~components/_formly-fields/query-forms/relative-date-type.component';

export const appConfig: ApplicationConfig = {
  providers: [
    provideAnimations(),
    importProvidersFrom(RouterModule.forRoot()),
    importProvidersFrom(CoreModule.forRoot()),
    importProvidersFrom(CockpitDashboardModule),
    importProvidersFrom(
      FormlyModule.forRoot({ types: [{ name: 'relative-date', component: RelativeDateTypeComponent }] })
    ),
  ],
};
