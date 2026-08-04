import { DynamicWidgetDefinition, hookWidget } from '@c8y/ngx-components';
import { provideCharts, withDefaultRegisterables } from 'ng2-charts';
import { assets } from './assets/assets';

export const EnergyConsumptionWidgetPluginProviders = [
  provideCharts(withDefaultRegisterables()),
  hookWidget({
    id: 'energy-comsumption.widget',
    label: 'Energy Consumption Widget',
    description: '',
    loadComponent: () =>
      import('./components/energy-consumption-widget/energy-consumption-widget.component').then(
        (m) => m.EnergyConsumptionWidgetComponent
      ),
    loadConfigComponent: () =>
      import('./components/energy-consumption-widget-config/energy-consumption-widget-config.component').then(
        (m) => m.EnergyConsumptionWidgetConfigComponent
      ),
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
  } satisfies DynamicWidgetDefinition),
];
