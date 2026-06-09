import { hookNavigator, hookRoute, NavigatorNode } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';

// Plugin 1 — Smart view device page
export const SmartViewsPluginProviders = [
  hookRoute({
    path: 'smart-view/:deviceId',
    loadComponent: () =>
      import('./components/smart-view/smart-view.component').then(
        (m) => m.SmartViewComponent
      ),
  }),
];

// Plugin 2 — Smart views configuration (navigator entry + configuration route)
export const SmartViewsConfigurationPluginProviders = [
  hookNavigator(
    new NavigatorNode({
      label: gettext('Smart views'),
      path: 'smart-views/configuration',
      icon: 'telescope',
      priority: 100,
    })
  ),
  hookRoute({
    path: 'smart-views/configuration',
    loadComponent: () =>
      import(
        './components/smart-view-configuration/smart-view-configuration.component'
      ).then((m) => m.SmartViewConfigurationComponent),
  }),
];
