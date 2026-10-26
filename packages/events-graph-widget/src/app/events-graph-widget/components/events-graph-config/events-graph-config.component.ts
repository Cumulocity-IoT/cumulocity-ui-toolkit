import { Component, inject, Input, OnInit } from '@angular/core';
import { CoreModule, DynamicComponent, OptionsService } from '@c8y/ngx-components';
import {
  DEFAULT_GRAPH_INTERVAL,
  DEFAULT_GRAPH_ITEM_SCALE,
  EventStatusTrackerConfig,
} from '../../models/event-graph.model';

@Component({
  selector: 'c8y-event-status',
  imports: [CoreModule],
  templateUrl: './events-graph-config.component.html',
  styleUrl: './events-graph-config.component.less',
})
export class EventsGraphConfigComponent implements DynamicComponent, OnInit {
  private readonly optionsService = inject(OptionsService);

  @Input() config: EventStatusTrackerConfig;

  private defaultColor = '#000000';

  get refreshInterval(): number {
    return this.config.realtimeInterval / 1000;
  }

  set refreshInterval(interval: number) {
    this.config.realtimeInterval = interval * 1000;
  }

  ngOnInit(): void {
    this.fetchDefaultColor();

    // mutate in place: the dashboard saves the object it handed in
    this.config.types = this.config.types ?? [];
    this.config.realtimeInterval = this.config.realtimeInterval || DEFAULT_GRAPH_INTERVAL;
    this.config.scale = this.config.scale || DEFAULT_GRAPH_ITEM_SCALE;
  }

  addEventType(): void {
    this.config.types.push({
      type: '',
      values: [{ name: '', color: this.defaultColor, label: '' }],
    });
  }

  removeEventType(index: number): void {
    this.config.types.splice(index, 1);
  }

  addValue(typeIndex: number): void {
    this.config.types[typeIndex].values.push({ name: '', color: this.defaultColor, label: '' });
  }

  removeValue(typeIndex: number, valueIndex: number): void {
    this.config.types[typeIndex].values.splice(valueIndex, 1);
  }

  private fetchDefaultColor(): void {
    const brandPrimary = this.optionsService.brandingCssVars?.['brand-primary'];

    if (brandPrimary) {
      this.defaultColor = brandPrimary;
    }
  }
}
