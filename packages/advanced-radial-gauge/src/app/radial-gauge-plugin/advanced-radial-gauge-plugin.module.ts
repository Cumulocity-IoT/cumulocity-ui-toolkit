import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CoreModule, hookWidget, MeasurementRealtimeService } from '@c8y/ngx-components';
import { FormlyModule } from '@ngx-formly/core';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { NgxGaugeModule } from 'ngx-gauge';
import { AdvancedRadialGaugeWidgetConfig } from './components/advanced-radial-gauge-config/advanced-radial-gauge.config.component';
import { AdvancedRadialGaugeWidget } from './components/advanced-radial-gauge/advanced-radial-gauge.component';
import { assets } from '../assets/assets';

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    RouterModule,
    FormsModule,
    NgxGaugeModule,
    FormlyModule.forChild(),
    TooltipModule,
  ],
  declarations: [AdvancedRadialGaugeWidget, AdvancedRadialGaugeWidgetConfig],
  providers: [
    MeasurementRealtimeService,
    hookWidget({
      id: 'advanced-radial-gauge-plugin',
      label: 'Advanced Radial Gauge Plugin',
      description:
        'Advanced Radial Gauge Plugin shows the latest realtime measurement on a radial gauge.',
      component: AdvancedRadialGaugeWidget,
      configComponent: AdvancedRadialGaugeWidgetConfig,
      previewImage: assets.previewImage,
      data: {
        settings: {
          noNewWidgets: false,
          ng1: {
            options: {
              noDeviceTarget: false,
              groupsSelectable: false,
            },
          },
        },
      },
    }),
  ],
})
export class AdvancedRadialGaugePluginModule {}
