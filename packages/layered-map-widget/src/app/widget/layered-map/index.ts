import { ENVIRONMENT_INITIALIZER, inject } from '@angular/core';
import { DynamicWidgetDefinition, hookWidget } from '@c8y/ngx-components';
import { FormlyConfig } from '@ngx-formly/core';
import { RelativeDateTypeComponent } from '~components/_formly-fields/query-forms/relative-date-type.component';
import { assetPaths } from '../../../assets/assets';

export const LayeredMapWidgetPluginProviders = [
  {
    provide: ENVIRONMENT_INITIALIZER,
    multi: true,
    useValue: () => {
      inject(FormlyConfig).addConfig({
        types: [{ name: 'relative-date', component: RelativeDateTypeComponent }],
      });
    },
  },
  hookWidget({
    id: 'iot.cumulocity.layered.map.widget',
    label: 'Layered Map',
    description:
      'Displays a map with position markers for selected devices. Support for configuration of additional layers and custom markers.',
    loadComponent: () =>
      import('./layered-map-widget.component').then((m) => m.LayeredMapWidgetComponent),
    loadConfigComponent: () =>
      import('./layered-map-widget-config.component').then((m) => m.LayeredMapWidgetConfig),
    previewImage: assetPaths.previewImage,
    data: {
      settings: {
        noNewWidgets: false,
      },
    },
  } satisfies DynamicWidgetDefinition),
];
