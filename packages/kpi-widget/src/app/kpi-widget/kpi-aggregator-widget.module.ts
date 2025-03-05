import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CoreModule, hookComponent } from '@c8y/ngx-components';
import { FormlyModule } from '@ngx-formly/core';
import { NgChartsModule } from 'ng2-charts';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { KpiAggregatorWidgetConfigComponent } from './components/kpi-aggregator-widget-config/kpi-aggregator-widget-config.component';
import { KpiAggregatorWidgetComponent } from './components/kpi-aggregator-widget/kpi-aggregator-widget.component';

@NgModule({
  imports: [
    CommonModule,
    CoreModule,
    RouterModule,
    FormsModule,
    TooltipModule,
    NgChartsModule,
    FormlyModule.forChild(),
    BsDropdownModule
  ],
  declarations: [KpiAggregatorWidgetComponent, KpiAggregatorWidgetConfigComponent],
  providers: [
    hookComponent({
      id: 'kpi-aggregator.widget',
      label: 'KPI Aggregator Widget',
      description: '',
      component: KpiAggregatorWidgetComponent,
      configComponent: KpiAggregatorWidgetConfigComponent,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      previewImage: require('./assets/preview.png'),
      data: {
        settings: {
          noNewWidgets: false,
          ng1: {
            options: {
              noDeviceTarget: true,
              groupsSelectable: true
            }
          }
        }
      }
    })
  ]
})
export class KpiAggregatorWidgetPluginModule {}
