import { Component, Input } from '@angular/core';
import { CoreModule, DynamicComponent, GlobalTimeContextWidgetConfig } from '@c8y/ngx-components';
import { EventStatusTrackerConfig } from '../../models/event-status-tracker';

@Component({
  selector: 'c8y-event-status',
  standalone: true,
  imports: [CoreModule],
  templateUrl: './events-graph-config.component.html',
  styleUrl: './events-graph-config.component.css',
})
export class EventsGraphConfigComponent implements DynamicComponent {
  @Input() config: EventStatusTrackerConfig & GlobalTimeContextWidgetConfig;

  ngOnInit() {
    if (!this.config.types) {
      this.config.types = [];
    }
    this.config.realtimeInterval = this.config.realtimeInterval || 30000;

    this.config = {
      ...this.config,
      widgetInstanceGlobalTimeContext: true,
      canDecoupleGlobalTimeContext: false,
    };
  }

  addEventType() {
    this.config.types.push({
      type: '',
      values: [{ name: '', color: '#000000', label: '' }],
    });
  }

  removeEventType(index: number) {
    this.config.types.splice(index, 1);
  }

  addValue(typeIndex: number) {
    this.config.types[typeIndex].values.push({ name: '', color: '#000000', label: '' });
  }

  removeValue(typeIndex: number, valueIndex: number) {
    this.config.types[typeIndex].values.splice(valueIndex, 1);
  }
}
