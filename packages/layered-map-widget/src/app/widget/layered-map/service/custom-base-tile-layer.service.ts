import { Injectable } from '@angular/core';
import { InventoryService } from '@c8y/client';
import { CustomBaseTileLayerEntry } from '../base-tile-layers';

export const CUSTOM_BASE_LAYER_MO_TYPE = 'ps_layeredMapBaseLayerConfig';
const FRAGMENT = 'ps_layeredMapBaseLayers';

@Injectable({ providedIn: 'root' })
export class CustomBaseTileLayerService {
  private moId: string | null = null;
  private cache: CustomBaseTileLayerEntry[] | null = null;

  constructor(private inventory: InventoryService) {}

  async load(): Promise<CustomBaseTileLayerEntry[]> {
    if (this.cache) {
      return this.cache;
    }

    const res = await this.inventory.list({ type: CUSTOM_BASE_LAYER_MO_TYPE, pageSize: 1 });
    const mo = res.data[0];

    if (!mo) {
      this.cache = [];
      return this.cache;
    }

    this.moId = mo.id;
    this.cache =
      (mo[FRAGMENT] as { layers: CustomBaseTileLayerEntry[] } | undefined)?.layers ?? [];

    return this.cache;
  }

  async save(layers: CustomBaseTileLayerEntry[]): Promise<void> {
    const fragment = { [FRAGMENT]: { layers } };

    if (this.moId) {
      await this.inventory.update({ id: this.moId, ...fragment });
    } else {
      const res = await this.inventory.create({
        type: CUSTOM_BASE_LAYER_MO_TYPE,
        name: 'Layered Map Base Layer Configuration',
        ...fragment,
      });
      this.moId = res.data.id;
    }

    this.cache = layers;
  }
}
