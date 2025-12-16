import { Component, inject, Input } from '@angular/core';
import {
  CoreModule,
  DynamicComponent,
  GlobalTimeContextWidgetConfig,
  OptionsService,
} from '@c8y/ngx-components';
import {
  DEFAULT_GRAPH_INTERVAL,
  DEFAULT_GRAPH_ITEM_SCALE,
  EventStatusTrackerConfig,
} from '../../models/event-graph.model';
import { has } from 'lodash';

@Component({
  selector: 'c8y-event-status',
  standalone: true,
  imports: [CoreModule],
  templateUrl: './events-graph-config.component.html',
  styleUrl: './events-graph-config.component.css',
})
export class EventsGraphConfigComponent implements DynamicComponent {
  private optionsService = inject(OptionsService);

  @Input() config: EventStatusTrackerConfig & GlobalTimeContextWidgetConfig;

  get refreshInterval(): number {
    return this.config.realtimeInterval / 1000;
  }

  set refreshInterval(interval: number) {
    this.config.realtimeInterval = interval * 1000;
  }

  private defaultColor: string = '#000000';

  ngOnInit() {
    this.fetchDefaultColor();

    if (!this.config.types) {
      this.config.types = [];
    }

    this.config.realtimeInterval = this.config.realtimeInterval || DEFAULT_GRAPH_INTERVAL;
    this.config.scale = this.config.scale || DEFAULT_GRAPH_ITEM_SCALE;

    this.config = {
      ...this.config,
      widgetInstanceGlobalTimeContext: true,
      canDecoupleGlobalTimeContext: false,
    };
  }

  addEventType() {
    this.config.types.push({
      type: '',
      values: [{ name: '', color: this.defaultColor, label: '' }],
    });
  }

  removeEventType(index: number) {
    this.config.types.splice(index, 1);
  }

  addValue(typeIndex: number) {
    this.config.types[typeIndex].values.push({ name: '', color: this.defaultColor, label: '' });
  }

  removeValue(typeIndex: number, valueIndex: number) {
    this.config.types[typeIndex].values.splice(valueIndex, 1);
  }

  private fetchDefaultColor(): void {
    if (has(this.optionsService.brandingCssVars, 'brand-primary')) {
      this.defaultColor = this.optionsService.brandingCssVars['brand-primary'];
    }
  }
}
