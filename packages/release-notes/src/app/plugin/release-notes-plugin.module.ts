import { ENVIRONMENT_INITIALIZER, inject, importProvidersFrom } from '@angular/core';
import { AlertModule, CoreModule, hookDrawer } from '@c8y/ngx-components';
import { AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { FormlyModule } from '@ngx-formly/core';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { MomentModule } from 'ngx-moment';
import { LocalStorageService } from '~services/local-storage.service';
import { ReleaseNotesMenuItemComponent } from '../components';
import { ReleaseNotesService } from '../services/release-notes.service';

export const ReleaseNotesPluginProviders = [
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
  hookDrawer({
    id: 'c8y.release-notes',
    priority: 100,
    position: 'right',
    component: ReleaseNotesMenuItemComponent,
  }),
  {
    provide: ENVIRONMENT_INITIALIZER,
    multi: true,
    useValue: () => {
      void inject(ReleaseNotesService).checkForNewRelease();
    },
  },
];

/** @deprecated Use ReleaseNotesPluginProviders instead */
export const ReleaseNotesPluginModule = ReleaseNotesPluginProviders;
