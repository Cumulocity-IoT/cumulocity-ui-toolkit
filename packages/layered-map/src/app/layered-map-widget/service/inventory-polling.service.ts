import { Injectable } from '@angular/core';
import { InventoryService } from '@c8y/client';
import { MyLayer, PositionUpdateManagedObject } from '../layered-map-widget.model';
import { Observable, Subscriber } from 'rxjs';
import { QueryLayerService } from './query-layer.service';

const FETCH_INTERVAL = 5000;

export type InventoryDelta = {
  add: PositionUpdateManagedObject[];
  remove: string[];
};
@Injectable()
export class InventoryPollingService {
  constructor(
    private inventory: InventoryService,
    private queryLayerService: QueryLayerService
  ) {}

  createPolling$(
    filter: object,
    layer: MyLayer,
    interval = FETCH_INTERVAL
  ): Observable<InventoryDelta> {
    return new Observable<InventoryDelta>((observer) => {
      this.iterateAfter(observer, filter, layer, interval);
    });
  }

  toDelta(mos: Array<PositionUpdateManagedObject>, layer: MyLayer) {
    const delta = {
      add: new Array<PositionUpdateManagedObject>(),
      remove: new Array<string>(),
    };

    for (const mo of mos) {
      if (!layer.devices.includes(mo.id)) {
        delta.add.push(mo);
      }
    }

    const toRemoveIds = layer.devices.filter((id) => mos.find((m) => m.id === id) === undefined);

    toRemoveIds.forEach((id) => delta.remove.push(id));

    return delta;
  }

  private async fetchMatchingManagedObjects(layerFilter: object) {
    const result = new Array<PositionUpdateManagedObject>();
    const filter = {
      withTotalPages: true,
      pageSize: 2000,
      ...this.queryLayerService.normalize(layerFilter),
    };

    let res = await this.inventory.list(filter);

    while (res.data.length) {
      res.data.forEach((mo) => result.push(mo as PositionUpdateManagedObject));

      if (!res.paging?.nextPage) {
        break;
      }
      res = await res.paging.next();
    }

    return result;
  }

  private iterateAfter(
    observer: Subscriber<InventoryDelta>,
    filter: object,
    layer: MyLayer,
    interval: number
  ) {
    if (observer.closed) {
      return;
    }
    setTimeout(() => {
      this.checkForUpdates(filter, layer).then(
        (delta) => {
          if (delta.add.length || delta.remove.length) {
            observer.next(delta);
          }
          this.iterateAfter(observer, filter, layer, interval);
        },
        () => {
          this.iterateAfter(observer, filter, layer, interval);
        }
      );
    }, interval);
  }

  private checkForUpdates(filter: object, layer: MyLayer) {
    return this.fetchMatchingManagedObjects(filter).then((sources) => this.toDelta(sources, layer));
  }
}
