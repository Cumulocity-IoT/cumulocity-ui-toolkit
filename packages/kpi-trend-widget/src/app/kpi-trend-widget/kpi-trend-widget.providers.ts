import {
  DynamicComponentErrorStrategy,
  type DynamicWidgetDefinition,
  hookWidget,
} from '@c8y/ngx-components';
import { hookWidgetConfig } from '@c8y/ngx-components/context-dashboard';
import { gettext } from '@c8y/ngx-components/gettext';
import { PREVIEW_IMAGE } from './preview-image';

/**
 * Kept from the widget's first home, the DER Add-on ("windy"), so dashboards created there keep
 * finding the widget: a dashboard stores the widget id, not the plugin it came from.
 */
export const KPI_TREND_WIDGET_ID = 'windy.kpi-trend';

export const KpiTrendWidgetPluginProviders = [
  hookWidget({
    id: KPI_TREND_WIDGET_ID,
    label: gettext('KPI Trend'),
    description: gettext(
      'Displays a single measurement value with a radial gauge (value vs. max) and a trend sparkline. Configurable as a radial primary or compact tile layout.'
    ),
    previewImage: PREVIEW_IMAGE,
    loadComponent: () =>
      import('./kpi-trend-widget.component').then((m) => m.KpiTrendWidgetComponent),
    errorStrategy: DynamicComponentErrorStrategy.OVERLAY_ERROR,
    data: {
      settings: {
        widgetDefaults: {
          _width: 5,
          _height: 3,
        },
      },
    },
  } satisfies DynamicWidgetDefinition),
  hookWidgetConfig({
    widgetId: KPI_TREND_WIDGET_ID,
    label: gettext('Data point'),
    expanded: true,
    priority: 90,
    loadComponent: () =>
      import('@c8y/ngx-components/datapoint-selector').then(
        (m) => m.WidgetDatapointsSelectorComponent
      ),
    initialState: {
      minActiveCount: 1,
      maxActiveCount: 1,
      defaultFormOptions: {
        showRange: true,
        showYellowRange: true,
        showRedRange: true,
        showTarget: true,
        showChart: false,
      },
    },
  }),
  hookWidgetConfig({
    widgetId: KPI_TREND_WIDGET_ID,
    label: gettext('Appearance'),
    priority: 80,
    loadComponent: () =>
      import('./kpi-trend-widget-config.component').then((m) => m.KpiTrendWidgetConfigComponent),
  }),
];
