import { hookActionBar, hookNavigator, hookRoute, NavigatorNode } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { SmartViewFactory } from './components/smart-view/smart-view.factory';
import { CreateSmartViewConfigurationActionFactory } from './components/create-smart-view-configuration/create-smart-view-configuration-action.factory';

// Plugin 1 — Smart view device page
export const SmartViewsPluginProviders = [
  hookRoute({
    path: 'smart-views/:id',
    loadComponent: () =>
      import('./components/smart-view/smart-view.component').then((m) => m.SmartViewComponent),
  }),
  hookNavigator(SmartViewFactory),
];

// Plugin 2 — Smart views configuration (navigator entry + configuration route)
export const SmartViewsConfigurationPluginProviders = [
  hookNavigator(
    new NavigatorNode({
      label: gettext('Smart views'),
      path: 'smart-views-configuration',
      icon: 'search-in-list',
      parent: 'settings',
      priority: 100,
    })
  ),
  hookRoute({
    path: 'smart-views-configuration',
    loadComponent: () =>
      import('./components/smart-view-configuration/smart-view-configuration.component').then(
        (m) => m.SmartViewConfigurationComponent
      ),
  }),
  hookActionBar(CreateSmartViewConfigurationActionFactory),
];
