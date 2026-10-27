import { Component, type DoCheck, inject, Input, type OnInit, signal } from '@angular/core';
import { InventoryService } from '@c8y/client';
import { CoreModule, type DynamicComponent, OptionsService } from '@c8y/ngx-components';
import {
  DEFAULT_GRAPH_INTERVAL,
  DEFAULT_GRAPH_ITEM_SCALE,
  type EventStatusTrackerConfig,
  type EventTypeConfig,
} from '../../models/event-graph.model';

type LaneDevice = NonNullable<EventTypeConfig['device']>;

@Component({
  selector: 'c8y-event-status',
  imports: [CoreModule],
  templateUrl: './events-graph-config.component.html',
  styleUrl: './events-graph-config.component.less',
})
export class EventsGraphConfigComponent implements DynamicComponent, OnInit, DoCheck {
  private readonly optionsService = inject(OptionsService);
  private readonly inventory = inject(InventoryService);

  @Input() config: EventStatusTrackerConfig;

  /**
   * Devices a lane can take its events from: those of the widget's group. `null` while the
   * target is not a group — lanes then all use the target itself.
   */
  readonly groupDevices = signal<LaneDevice[] | null>(null);

  private defaultColor = '#000000';
  /** The target the device list was loaded for; the dashboard may change it while open. */
  private loadedTargetId: string | undefined;

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

  ngDoCheck(): void {
    const targetId = this.config?.device?.id;

    if (targetId !== this.loadedTargetId) {
      this.loadedTargetId = targetId;
      void this.loadGroupDevices(targetId);
    }
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

  compareDevices = (a?: LaneDevice, b?: LaneDevice): boolean => a?.id === b?.id;

  private async loadGroupDevices(targetId: string | undefined): Promise<void> {
    let devices: LaneDevice[] | null = null;

    if (targetId) {
      try {
        const { data: target } = await this.inventory.detail(targetId);

        if (target.c8y_IsDeviceGroup) {
          const { data } = await this.inventory.list({
            query: `$filter=(bygroupid(${targetId}) and has(c8y_IsDevice)) $orderby=name`,
            pageSize: 2000,
          });

          devices = data.map(({ id, name }) => ({ id, name: name as string }));
        }
      } catch {
        // keep the lanes as configured rather than dropping their devices on a failed request
        return;
      }
    }

    // a stale answer for a target the user has already changed
    if (targetId !== this.loadedTargetId) return;

    this.groupDevices.set(devices);
    // lanes may only point at devices of the current group
    const allowed = new Set((devices ?? []).map(({ id }) => id));

    for (const type of this.config.types) {
      if (type.device && !allowed.has(type.device.id)) delete type.device;
    }
  }

  private fetchDefaultColor(): void {
    const brandPrimary = this.optionsService.brandingCssVars?.['brand-primary'];

    if (brandPrimary) {
      this.defaultColor = brandPrimary;
    }
  }
}
