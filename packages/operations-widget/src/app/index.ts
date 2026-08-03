import { DynamicWidgetDefinition, hookWidget } from '@c8y/ngx-components';
import {
  exportConfigWithDevice,
  importConfigWithDevice,
} from '@c8y/ngx-components/widgets/import-export-config';
import * as c8yConfig from '../../cumulocity.config';
import { assetPaths } from '../assets/assets';

export const OperationsWidgetPluginDefinition = {
  id: 'c8y.operations-widget.plugin',
  label: 'Operations',
  description: c8yConfig.default.runTime.description,
  loadComponent: () =>
    import('./components/operations-widget/operations-widget.component').then(
      (m) => m.OperationsWidgetComponent
    ),
  loadConfigComponent: () =>
    import('./components/widget-config/operations-widget-config.component').then(
      (m) => m.OperationsWidgetConfigComponent
    ),
  previewImage: assetPaths.previewImage,
  data: {
    schema: () =>
      import('c8y-schema-loader?interfaceName=OperationWidgetConfig!./models/operations-widget-config.model'),
    export: exportConfigWithDevice,
    import: importConfigWithDevice,
    settings: {
      noNewWidgets: false,
    },
  },
} satisfies DynamicWidgetDefinition;

export const OperationsWidgetPluginConfigProviders = [hookWidget(OperationsWidgetPluginDefinition)];
