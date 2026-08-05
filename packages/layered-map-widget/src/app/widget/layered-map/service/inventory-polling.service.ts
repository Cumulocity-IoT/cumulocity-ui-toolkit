import { inject, Injectable } from '@angular/core';
import { IManagedObject, InventoryService } from '@c8y/client';
import { MyLayer } from '../layered-map-widget.model';
import { EMPTY, from, Observable, timer } from 'rxjs';
import { catchError, exhaustMap, filter } from 'rxjs/operators';
import { normalizeQueryFilter } from '~components/_formly-fields/query-forms/formly-query-blocks';

const FETCH_INTERVAL = 5000;

export type InventoryDelta = {
  add: IManagedObject[];
  remove: string[];
};
@Injectable()
export class InventoryPollingService {
  private inventory = inject(InventoryService);

  createPolling$(
    layerFilter: object,
    layer: MyLayer,
    interval = FETCH_INTERVAL
  ): Observable<InventoryDelta> {
    return timer(interval, interval).pipe(
      // Catching inside the projection keeps the outer timer alive: a failed
      // request skips this tick instead of terminating the polling for good.
      exhaustMap(() =>
        from(this.checkForUpdates(layerFilter, layer)).pipe(catchError(() => EMPTY))
      ),
      filter((delta) => delta.add.length > 0 || delta.remove.length > 0)
    );
  }

  toDelta(mos: Array<IManagedObject>, layer: MyLayer) {
    const delta = {
      add: new Array<IManagedObject>(),
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

  private checkForUpdates(layerFilter: object, layer: MyLayer) {
    return this.fetchMatchingManagedObjects(layerFilter).then((sources) =>
      this.toDelta(sources, layer)
    );
  }

  private async fetchMatchingManagedObjects(layerFilter: object) {
    const result = new Array<IManagedObject>();
    const filter = {
      withTotalPages: true,
      pageSize: 2000,
      ...normalizeQueryFilter(layerFilter),
    };

    let res = await this.inventory.list(filter);

    while (res.data.length) {
      res.data.forEach((mo) => result.push(mo));

      if (!res.paging?.nextPage) {
        break;
      }
      res = await res.paging.next();
    }

    return result;
  }
}
