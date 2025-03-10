import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AlertModule, CoreModule, hookDrawer } from '@c8y/ngx-components';
import { AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { FormlyModule } from '@ngx-formly/core';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { MomentModule } from 'ngx-moment';
import {
  ReleaseNotesDisplayListModalComponent,
  ReleaseNotesMenuItemComponent,
} from '../components';
import { LocalStorageService, ReleaseNotesService } from '../services';

@NgModule({
  declarations: [
    ReleaseNotesMenuItemComponent,
    ReleaseNotesDisplayListModalComponent,
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
    hookDrawer({
      id: 'c8y.release-notes',
      priority: 100, // below UI settings
      position: 'right',
      component: ReleaseNotesMenuItemComponent,
    }),
  ],
})
export class ReleaseNotesPluginModule {
  constructor(private releaseNoteService: ReleaseNotesService) {
    this.releaseNoteService.checkForNewRelease();
  }
}
