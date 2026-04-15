import { DynamicWidgetDefinition, hookWidget } from '@c8y/ngx-components';
import {
  exportConfigWithDevice,
  importConfigWithDevice,
} from '@c8y/ngx-components/widgets/import-export-config';
import * as c8yConfig from '../../cumulocity.config';
import { assetPaths } from '../assets/assets';
import { OperationsWidgetComponent } from './components/operations-widget/operations-widget.component';
import { OperationsWidgetConfigComponent } from './components/widget-config/operations-widget-config.component';

export const OperationsWidgetPluginDefinition = {
  id: 'c8y.operations-widget.plugin',
  label: 'Operations',
  description: c8yConfig.default.runTime.description,
  component: OperationsWidgetComponent,
  configComponent: OperationsWidgetConfigComponent,
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
