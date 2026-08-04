import { computed, inject, input, signal, Component } from '@angular/core';
import { EventService, IManagedObject, InventoryService } from '@c8y/client';
import { CoreModule, PropertiesListComponent, PropertiesListItem } from '@c8y/ngx-components';
import { DEFAULT_CONFIG, MyLayer, PopoverAction, PopoverConfig } from '../layered-map-widget.model';
import { PopoverActionService } from '../service/popover-action.service';
import { latLng, LatLng } from 'leaflet';
import { get, isEmpty } from 'lodash';
import { AlarmDisplayComponent } from './alarm-display/alarm-display.component';
import { ActionIconPipe } from './action-icon.pipe';

@Component({
  selector: 'popup-component',
  templateUrl: './popup.component.html',
  providers: [PopoverActionService],
  standalone: true,
  imports: [CoreModule, AlarmDisplayComponent, ActionIconPipe, PropertiesListComponent],
})
export class PopupComponent {
  content = input.required<{ deviceId: string; layer: MyLayer }>();

  mo = signal<IManagedObject | undefined>(undefined);
  isLoading = signal(false);
  lastUpdated = signal<string | undefined>(undefined);
  active = signal(false);
  cfg = signal<PopoverConfig>(DEFAULT_CONFIG);

  /** Flattened latest measurement entries from the `c8y_LatestMeasurements` fragment. */
  latestValues = computed(() => {
    const latest = this.mo()?.['c8y_LatestMeasurements'] as
      | Record<string, Record<string, { value?: number; unit?: string; time?: string }>>
      | undefined;

    if (!latest) {
      return [];
    }

    const values: { key: string; value: number; unit: string; time?: string }[] = [];

    for (const [fragment, series] of Object.entries(latest)) {
      if (!series || typeof series !== 'object') {
        continue;
      }

      for (const [name, point] of Object.entries(series)) {
        if (!point || typeof point.value !== 'number') {
          continue;
        }

        values.push({
          key: name === fragment ? name : `${fragment} ${name}`,
          value: point.value,
          unit: point.unit ?? '',
          time: point.time,
        });
      }
    }

    return values;
  });

  /**
   * Recursively extracts all leaf properties from an object, returning a flat
   * array of `PropertiesListItem` entries. Handles nested objects and arrays.
   */
  private extractObjectProperties(
    obj: Record<string, unknown>,
    basePath: string
  ): PropertiesListItem[] {
    const items: PropertiesListItem[] = [];

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = `${basePath}.${key}`;

      if (value === undefined || value === null) {
        continue;
      }

      if (typeof value === 'object' && !Array.isArray(value)) {
        // Recurse into nested objects
        items.push(...this.extractObjectProperties(value as Record<string, unknown>, fullKey));
      } else {
        // Leaf value: create a property entry with the resolved value
        items.push({
          label: fullKey,
          value: `${value as string | number | boolean}`,
          type: Array.isArray(value) ? 'array' : 'string',
        });
      }
    }

    return items;
  }

  /** Whether asset properties are configured (regardless of MO load state). */
  hasAssetProperties = computed(() => !isEmpty(this.cfg().assetProperties));

  /**
   * Configured asset-specific properties resolved against the device managed
   * object. Property paths come from the layer's popover config.
   *
   * Simple (string/number) values are returned as-is for inline display.
   * Object-type properties have their nested properties extracted so
   * <c8y-properties-list> can render them individually.
   */
  assetProperties = computed(() => {
    const keys = this.cfg().assetProperties ?? [];
    const mo = this.mo();

    if (!mo || isEmpty(keys)) {
      return [];
    }

    const result: PropertiesListItem[] = [];

    for (const key of keys) {
      const raw: unknown = get(mo, key);

      if (raw === undefined || raw === null) {
        continue;
      }

      if (typeof raw === 'object') {
        // Extract nested properties from the object and add them individually
        result.push(...this.extractObjectProperties(raw as Record<string, unknown>, key));
      } else {
        // Simple type: inline display
        result.push({
          label: key,
          value: `${raw as string | number | boolean}`,
          type: Array.isArray(raw) ? 'array' : 'string',
        });
      }
    }

    return result;
  });

  /** Mutable track line — not rendered in the popup, not a signal. */
  line: LatLng[] = [];

  private inventory = inject(InventoryService);

  private events = inject(EventService);

  private actions = inject(PopoverActionService);

  onShow(): void {
    // Refresh cfg from the layer every time the popup opens so that changes
    // made to popoverConfig after the marker was created are reflected.
    const popoverConfig = this.content()?.layer.config.popoverConfig;

    this.cfg.set(popoverConfig ?? DEFAULT_CONFIG);
    void this.startFetch();
  }

  private startFetch(): Promise<void[]> {
    this.isLoading.set(true);
    const promises: Promise<void>[] = [this.fetchDevice()];

    if (this.cfg().showDate) {
      promises.push(this.fetchLatestDate());
    }

    return Promise.all(promises).finally(() => this.isLoading.set(false));
  }

  private fetchDevice(): Promise<void> {
    return this.inventory.detail(this.content().deviceId).then((result) => {
      this.mo.set(result.data);
    });
  }

  private fetchLatestDate(): Promise<void> {
    const eventFilter = {
      pageSize: 1,
      withTotalPages: false,
      fragmentType: 'c8y_Position',
      source: this.content().deviceId,
    };

    return this.events.list(eventFilter).then((result) => {
      if (!isEmpty(result.data)) {
        this.lastUpdated.set(result.data[0].time);
      }
    });
  }

  toggleActive(): void {
    this.active.set(!this.active());
    this.line = [];
  }

  onUpdate(mo: IManagedObject): void {
    this.lastUpdated.set(mo.lastUpdated);

    if (this.active()) {
      const newCoord = latLng(mo['c8y_Position'] as { lat: number; lng: number });

      if (isEmpty(this.line)) {
        this.line.push(newCoord);
      } else {
        const latestCoord = this.line[this.line.length - 1];

        if (latestCoord.distanceTo(newCoord) > 0) {
          this.line.push(newCoord);
        }
      }
    }
  }

  sendAction(action: PopoverAction, mo: IManagedObject | undefined) {
    if (!mo) {
      return;
    }

    void this.actions.send(action, mo);
  }

  onHide(): void {}
}
