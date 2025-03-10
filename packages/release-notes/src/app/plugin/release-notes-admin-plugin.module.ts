import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import {
  AlertModule,
  CoreModule,
  gettext,
  hookNavigator,
  hookRoute,
} from '@c8y/ngx-components';
import { AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { FormlyModule } from '@ngx-formly/core';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { MomentModule } from 'ngx-moment';
import {
  ReminderNotesAdminListComponent,
  ReminderNotesAdminModalComponent,
} from '../components';
import { RELEASE_NOTES__ADMIN_PATH } from '../release-notes.model';
import { LocalStorageService, ReleaseNotesService } from '../services';

@NgModule({
  declarations: [
    ReminderNotesAdminModalComponent,
    ReminderNotesAdminListComponent,
  ],
  imports: [
    AssetSelectorModule,
    AlertModule,
    CollapseModule,
    CommonModule,
    CoreModule,
    FormlyModule.forChild({}),
    MomentModule,
    RouterModule,
    TooltipModule,
  ],
  providers: [
    LocalStorageService,
    ReleaseNotesService,
    hookRoute({
      path: RELEASE_NOTES__ADMIN_PATH,
      component: ReminderNotesAdminListComponent,
    }),
    hookNavigator({
      label: gettext('Release Notes') as string,
      icon: 'activity-history',
      path: `/${RELEASE_NOTES__ADMIN_PATH}`,
      parent: 'Settings',
      priority: 0,
      preventDuplicates: true,
    }),
  ],
})
export class ReleaseNotesAdminPluginModule {
  constructor(private releaseNoteService: ReleaseNotesService) {
    this.releaseNoteService.checkForNewRelease();
  }
}
