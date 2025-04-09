import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { AlertModule, CoreModule, EventRealtimeService, hookAction } from '@c8y/ngx-components';
import { AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { FormlyModule } from '@ngx-formly/core';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { MomentModule } from 'ngx-moment';
import { AssetFieldType } from '~components/_formly-fields/asset.formly/asset.formly.component';
import { TimeFieldType } from '~components/_formly-fields/time.formly/time.formly.component';
import { ActiveTabService } from '~services/active-tab.service';
import { DomService } from '~services/dom.service';
import { LocalStorageService } from '~services/local-storage.service';
import {
  ReminderDrawerComponent,
  ReminderIndicatorComponent,
  ReminderModalComponent,
} from './components';
import { ReminderTypeComponent } from './components/reminder-type/reminder-type.component';
import { ReminderService } from './services/reminder.service';

@NgModule({
  declarations: [
    ReminderIndicatorComponent,
    ReminderDrawerComponent,
    ReminderModalComponent,
    ReminderTypeComponent,
  ],
  imports: [
    AssetSelectorModule,
    AlertModule,
    CollapseModule,
    CommonModule,
    CoreModule,
    FormlyModule.forChild({
      types: [
        { name: 'time', component: TimeFieldType },
        { name: 'asset', component: AssetFieldType },
      ],
    }),
    MomentModule,
    RouterModule,
    TooltipModule,
  ],
  providers: [
    ActiveTabService,
    DomService,
    EventRealtimeService,
    LocalStorageService,
    ReminderService,
    hookAction({
      component: ReminderIndicatorComponent,
    }),
  ],
})
export class ReminderPluginModule {
  constructor(private reminderService: ReminderService) {
    void this.reminderService.init();
  }
}
