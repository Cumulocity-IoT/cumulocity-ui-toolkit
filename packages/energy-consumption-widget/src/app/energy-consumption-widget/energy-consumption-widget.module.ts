import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CoreModule, hookComponent } from '@c8y/ngx-components';
import { FormlyModule } from '@ngx-formly/core';
import { NgChartsModule } from 'ng2-charts';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { assets } from './assets/assets';
import { EnergyConsumptionWidgetConfigComponent } from './components/energy-consumption-widget-config/energy-consumption-widget-config.component';
import { EnergyConsumptionWidgetComponent } from './components/energy-consumption-widget/energy-consumption-widget.component';

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    RouterModule,
    FormsModule,
    TooltipModule,
    NgChartsModule,
    FormlyModule.forChild({
      types: [
        {
          name: 'color',
          extends: 'input',
          defaultOptions: {
            props: {
              type: 'color',
            },
          },
        },
      ],
    }),
    BsDropdownModule,
  ],
  declarations: [EnergyConsumptionWidgetComponent, EnergyConsumptionWidgetConfigComponent],
  providers: [
    hookComponent({
      id: 'energy-comsumption.widget',
      label: 'Energy Consumption Widget',
      description: '',
      component: EnergyConsumptionWidgetComponent,
      configComponent: EnergyConsumptionWidgetConfigComponent,
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
export class EnergyConsumptionWidgetPluginModule {}
