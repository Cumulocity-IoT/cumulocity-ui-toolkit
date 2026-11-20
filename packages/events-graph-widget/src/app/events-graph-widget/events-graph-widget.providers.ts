import { type DynamicWidgetDefinition, hookWidget } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { assets } from './assets/assets';
import { EventStatusTrackerService } from './services/events-graph.service';

export const EventsGraphWidgetPluginProviders = [
  EventStatusTrackerService,
  hookWidget({
    id: 'events-graph.widget',
    label: gettext('Events Graph'),
    description: gettext('Show event occurrence in a timeline chart.'),
    loadComponent: () =>
      import('./components/events-graph/events-graph.component').then((m) => m.EventGraphComponent),
    loadConfigComponent: () =>
      import('./components/events-graph-config/events-graph-config.component').then(
        (m) => m.EventsGraphConfigComponent
      ),
    previewImage: assets.previewImage,
    data: {
      settings: {
        noNewWidgets: false,
        widgetDefaults: {
          _width: 12,
          _height: 5,
        },
        ng1: {
          options: {
            noDeviceTarget: false,
            groupsSelectable: true,
          },
        },
      },
    },
  } satisfies DynamicWidgetDefinition),
];

/** @deprecated Use {@link EventsGraphWidgetPluginProviders}. Kept for backward compatibility. */
export const EventsGraphWidgetModule = EventsGraphWidgetPluginProviders;
