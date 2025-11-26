import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import {
  CoreModule,
  DynamicWidgetDefinition,
  hookWidget,
  WidgetDataType,
} from '@c8y/ngx-components';
import { assets } from './assets/assets';
import { EventStatusTrackerService } from './services/events-graph.service';

async function loadViewComponent() {
  const { EventGraphComponent } = await import('./components/events-graph/events-graph.component');
  return EventGraphComponent;
}

async function loadConfigComponent() {
  const { EventsGraphConfigComponent } = await import(
    './components/events-graph-config/events-graph-config.component'
  );
  return EventsGraphConfigComponent;
}

@NgModule({
  imports: [CoreModule, CommonModule],
  providers: [
    EventStatusTrackerService,
    hookWidget({
      id: 'events-graph.widget',
      label: 'Events Graph',
      description: 'Show event occurence in a timeline chart.',
      loadComponent: loadViewComponent,
      loadConfigComponent: loadConfigComponent,
      previewImage: assets.previewImage,
      data: {
        settings: {
          noNewWidgets: false, // Set this to true, to don't allow adding new widgets.
          widgetDefaults: {
            _width: 12,
            _height: 5,
          },
          ng1: {
            options: {
              noDeviceTarget: false, // Set this to true to hide the device selector.
              groupsSelectable: true, // Set this, if not only devices should be selectable.
            },
          },
        },
        displaySettings: {
          globalTimeContext: true, // Set this to true, to add a global time context binding
        },
      } as WidgetDataType,
    } as DynamicWidgetDefinition),
  ],
})
export class EventsGraphWidgetModule {}
