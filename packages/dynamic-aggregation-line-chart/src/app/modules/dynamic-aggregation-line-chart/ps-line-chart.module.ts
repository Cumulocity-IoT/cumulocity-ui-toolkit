import { NgModule } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CoreModule, DynamicWidgetDefinition, gettext, hookWidget, WidgetDataType } from '@c8y/ngx-components';
import { AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { DatapointSelectorModule } from '@c8y/ngx-components/datapoint-selector';
import { DynamicAggregationLineChartComponent } from './dynamic-aggregation-line-chart.component';
import { DynamicAggregationLineChartConfigComponent } from './dynamic-aggregation-line-chart-config.component';
import { assetPaths } from '../../../assets/assets';
import { NgxEchartsModule } from 'ngx-echarts';
import { EchartsLineChartComponent } from '../../shared/line-chart.component';
import { CollapseModule } from 'ngx-bootstrap/collapse';

@NgModule({
  imports: [
    CoreModule,
    FormsModule,
    CollapseModule,
    NgxEchartsModule.forRoot({ echarts: () => import('echarts') }),
    EchartsLineChartComponent,
    AssetSelectorModule,
    DatapointSelectorModule,
  ],
  declarations: [DynamicAggregationLineChartComponent, DynamicAggregationLineChartConfigComponent],
  providers: [
    hookWidget({
      id: 'dynamic-aggregation-line-chart.widget',
      label: gettext('Dynamic Aggregation Line Chart'),
      description: gettext('A dynamic aggregation line chart displaying min/avg/max time-series measurement data.'),
      component: DynamicAggregationLineChartComponent,
      previewImage: assetPaths.previewImage,
      configComponent: DynamicAggregationLineChartConfigComponent,
      data: {
        settings: {
          noNewWidgets: false,
          ng1: {
            options: {
              noDeviceTarget: true,
              deviceTargetNotRequired: true,
              groupsSelectable: false,
            },
          },
          // widgetDefaults: {
          //   _width: 4,
          //   _height: 8,
          // },
        },
        displaySettings: {
          globalTimeContext: true // Set this to true, to add a global time context binding
        }
      } as WidgetDataType,
    } as DynamicWidgetDefinition),
  ],
})
export class DynamicAggregationLineChartModule {}
