
import { ENVIRONMENT_INITIALIZER, inject, importProvidersFrom } from '@angular/core';
import { CommonModule } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
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
import { AssetAccessService } from '~services/asset-access.service';
import { DomService } from '~services/dom.service';
import { LocalStorageService } from '~services/local-storage.service';
import { ReminderIndicatorComponent } from './components/reminder-indicator/reminder-indicator.component';
import { ReminderService } from './services/reminder.service';

export const ReminderPluginProviders = [
  ActiveTabService,
  DomService,
  EventRealtimeService,
  LocalStorageService,
  ReminderService,
  importProvidersFrom(
    AssetSelectorModule,
    AlertModule,
    CollapseModule,
    CoreModule,
    FormlyModule.forChild({
      types: [
        { name: 'time', component: TimeFieldType },
        { name: 'asset', component: AssetFieldType },
      ],
    }),
    MomentModule,
    TooltipModule
    // dependencies: api services
    provideHttpClient(),
    EventRealtimeService,
    // dependencies: toolkit services
    AssetAccessService,
    LocalStorageService,
    ActiveTabService,
    DomService,
  ),
  hookAction({
    component: ReminderIndicatorComponent,
  }),
  {
    provide: ENVIRONMENT_INITIALIZER,
    multi: true,
    useValue: () => {
      void inject(ReminderService).init();
    },
  },
];

/** @deprecated Use ReminderPluginProviders instead */
export const ReminderPluginModule = ReminderPluginProviders;
