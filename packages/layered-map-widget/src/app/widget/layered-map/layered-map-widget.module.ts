import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CoreModule, hookWidget } from '@c8y/ngx-components';
import { ContextWidgetConfig } from '@c8y/ngx-components/context-dashboard';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { TimepickerModule } from 'ngx-bootstrap/timepicker';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { IconSelectorModule } from '@c8y/ngx-components/icon-selector';
import { LayeredMapWidgetConfig } from './layered-map-widget-config.component';
import { LayeredMapWidgetComponent } from './layered-map-widget.component';
import { EventLineCreatorModalComponent } from './event-line-creator/event-line-creator-modal.component';
import { TrackListComponent } from './track-list/track-list.component';
import { DrawLineCreatorModalComponent } from './draw-line-creator/draw-line-creator-modal.component';
import { PopupComponent } from './popup/popup.component';
import { LayerModalComponent } from './layer-config/layer-modal.component';
import { LayerListComponent } from './layer-config/layer-list.component';
import { AlarmDisplayComponent } from './popup/alarm-display/alarm-display.component';
import { PopoverModalComponent } from './popover-config/popover-modal.component';
import { ActionIconPipe } from './popup/action-icon.pipe';
import { CenterMapModalComponent } from './center-map/center-map-modal.component';
import { assetPaths } from '../../../assets/assets';

const BOOSTRAP_MODULES = [BsDatepickerModule, TimepickerModule, CollapseModule, TooltipModule];
@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    CoreModule,
    ...BOOSTRAP_MODULES,
    IconSelectorModule,
    AssetSelectorModule,
    PopoverModalComponent,
    LayerModalComponent,
  ],
  declarations: [
    LayeredMapWidgetConfig,
    LayeredMapWidgetComponent,
    EventLineCreatorModalComponent,
    DrawLineCreatorModalComponent,
    CenterMapModalComponent,
    LayerListComponent,
    TrackListComponent,
    PopupComponent,
    ActionIconPipe,
    AlarmDisplayComponent,
  ],
  providers: [
    hookWidget({
      id: 'iot.cumulocity.layered.map.widget',
      label: 'Layered Map',
      description:
        'Displays a map with position markers for selected devices. Support for configuration of additional layers and custom markers.',
      component: LayeredMapWidgetComponent,
      configComponent: LayeredMapWidgetConfig,
      previewImage: assetPaths.previewImage,
      data: {
        settings: {
          noNewWidgets: false,
          ng1: {
            options: {
              noDeviceTarget: true,
              groupsSelectable: false,
            },
          },
        },
      } as ContextWidgetConfig,
    }),
  ],
})
export class LayeredMapWidgetModule {}
