import { ENVIRONMENT_INITIALIZER, inject, importProvidersFrom } from '@angular/core';
import { AlertModule, CoreModule, hookNavigator, hookRoute } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { FormlyModule } from '@ngx-formly/core';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { MomentModule } from 'ngx-moment';
import { LocalStorageService } from '~services/local-storage.service';
import { RELEASE_NOTES__ADMIN_PATH } from '../models/release-notes.model';
import { ReleaseNotesService } from '../services/release-notes.service';

export const ReleaseNotesAdminPluginProviders = [
  LocalStorageService,
  ReleaseNotesService,
  importProvidersFrom(
    AssetSelectorModule,
    AlertModule,
    CollapseModule,
    CoreModule,
    FormlyModule.forChild({}),
    MomentModule,
    TooltipModule
  ),
  hookRoute({
    path: RELEASE_NOTES__ADMIN_PATH,
    loadComponent: () =>
      import('../components/admin-list/admin-list.component').then(
        (m) => m.ReminderNotesAdminListComponent
      ),
  }),
  hookNavigator({
    label: gettext('Release Notes'),
    icon: 'activity-history',
    path: `/${RELEASE_NOTES__ADMIN_PATH}`,
    parent: 'Settings',
    priority: 0,
    preventDuplicates: true,
  }),
  {
    provide: ENVIRONMENT_INITIALIZER,
    multi: true,
    useValue: () => {
      void inject(ReleaseNotesService).checkForNewRelease();
    },
  },
];

/** @deprecated Use ReleaseNotesAdminPluginProviders instead */
export const ReleaseNotesAdminPluginModule = ReleaseNotesAdminPluginProviders;
