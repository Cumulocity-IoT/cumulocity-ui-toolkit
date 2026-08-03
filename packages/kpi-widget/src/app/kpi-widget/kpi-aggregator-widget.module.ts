import { DynamicWidgetDefinition, hookWidget } from '@c8y/ngx-components';
import { assets } from './assets/assets';

export const KpiAggregatorWidgetPluginProviders = [
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
