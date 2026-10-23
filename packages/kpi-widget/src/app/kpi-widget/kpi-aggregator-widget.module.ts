import { DynamicWidgetDefinition, hookWidget } from '@c8y/ngx-components';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { assets } from './assets/assets';

export const KpiAggregatorWidgetPluginProviders = [
  // the pie chart view uses ng2-charts, which needs the Chart.js controllers registered
  provideCharts(withDefaultRegisterables()),
  hookWidget({
    id: 'kpi-aggregator.widget',
    label: 'KPI Aggregator Widget',
    description: '',
    loadComponent: () =>
      import('./components/kpi-aggregator-widget/kpi-aggregator-widget.component').then(
        (m) => m.KpiAggregatorWidgetComponent
      ),
    loadConfigComponent: () =>
      import('./components/kpi-aggregator-widget-config/kpi-aggregator-widget-config.component').then(
        (m) => m.KpiAggregatorWidgetConfigComponent
      ),
    previewImage: assets.previewImage,
    data: {
      settings: {
        noNewWidgets: false,
        ng1: {
          options: {
            noDeviceTarget: true,
            groupsSelectable: true,
          },
        },
      },
    },
  } satisfies DynamicWidgetDefinition),
];
