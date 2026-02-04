import { Injectable } from '@angular/core';
import { EventService, InventoryService } from '@c8y/client';
import {
  isQueryLayerConfig,
  MyLayer,
  PollingDelta,
  PositionUpdateManagedObject,
  QueryLayerConfig,
} from '../layered-map-widget.model';
import { Observable, Subscriber } from 'rxjs';
import { QueryLayerService } from './query-layer.service';
import { isEmpty } from 'lodash';

const FETCH_INTERVAL = 5000;

@Injectable()
export class EventPollingService {
  constructor(
    private event: EventService,
    private queryLayerService: QueryLayerService,
    private inventory: InventoryService
  ) {}

  createPolling$(layer: MyLayer, interval = FETCH_INTERVAL): Observable<PollingDelta> {
    if (!isQueryLayerConfig(layer.config) || layer.config.type !== 'Event') {
      throw new Error(`Layer is not event layer! ${JSON.stringify(layer)}`);
    }

    return new Observable<PollingDelta>((observer) => {
      this.iterateAfter(observer, layer, interval);
    });
  }

  async toPollingDelta(sources: Set<string>, layer: MyLayer) {
    const delta = {
      add: new Array<PositionUpdateManagedObject>(),
      remove: new Array<string>(),
    };

    const idsToAdd = [...sources].filter((source) => !layer.devices.includes(source));

    if (!isEmpty(idsToAdd)) {
      delta.add.push(...(await this.resolveManagedObjects(idsToAdd)));
    }

    const toRemoveIds = layer.devices.filter((id) => !sources.has(id));

    toRemoveIds.forEach((id) => delta.remove.push(id));

    return delta;
  }

  private iterateAfter(observer: Subscriber<PollingDelta>, layer: MyLayer, interval: number) {
    if (observer.closed) {
      return;
    }
    setTimeout(() => {
      this.checkForUpdates(layer).then(
        (delta) => {
          if (delta.add.length || delta.remove.length) {
            observer.next(delta);
          }
          this.iterateAfter(observer, layer, interval);
        },
        () => {
          this.iterateAfter(observer, layer, interval);
        }
      );
    }, interval);
  }

  private checkForUpdates(layer: MyLayer) {
    const config = layer.config as QueryLayerConfig;
    return this.fetchMatchingEvents(config).then((sources) => this.toPollingDelta(sources, layer));
  }

  private async resolveManagedObjects(ids: string[]) {
    const filter = {
      ids: ids.toString(),
      fragmentType: 'c8y_Position',
      withChildren: false,
      pageSize: 100,
    };

    if (ids.length <= 100) {
      return this.inventory
        .list({ ...filter, withTotalPages: false })
        .then((res) => res.data as PositionUpdateManagedObject[]);
    } else {
      const mos: PositionUpdateManagedObject[] = [];
      let res = await this.inventory.list({ ...filter, withTotalPages: true });

      while (res.data.length) {
        mos.push(...(res.data as PositionUpdateManagedObject[]));

        if (!res.paging?.nextPage) {
          break;
        }
        res = await res.paging.next();
      }

      return mos;
    }
  }

  private async fetchMatchingEvents(config: QueryLayerConfig) {
    const result = new Set<string>();
    const filter = {
      withTotalPages: true,
      pageSize: 100,
      ...this.queryLayerService.normalize(config.filter),
    };

    let res = await this.event.list(filter);

    while (res.data.length) {
      const ids = res.data
        .filter((event) => !result.has(event.source.id))
        .map((event) => event.source.id);

      ids.forEach((id) => result.add(id));

      if (!res.paging?.nextPage) {
        break;
      }
      res = await res.paging.next();
    }

    return result;
  }
}
