import { Injectable } from '@angular/core';
import { IManagedObject, InventoryService } from '@c8y/client';
import { Observable, Subscriber } from 'rxjs';

const FETCH_INTERVAL = 5000;

export type InventoryDelta = {
  add: IManagedObject[];
  remove: string[];
};
@Injectable()
export class InventoryDeltaPollingService {
  constructor(private inventory: InventoryService) {}

  createPolling$(filter: object, interval = FETCH_INTERVAL, mos: string[] = []): Observable<InventoryDelta> {
    return new Observable<InventoryDelta>((observer) => {
      this.iterateAfter(observer, filter, interval, mos);
    });
  }

  private iterateAfter(observer: Subscriber<InventoryDelta>, filter: object, interval: number, mos: string[]) {
    if (observer.closed) {
      return;
    }
    setTimeout(() => {
      this.checkForUpdates(filter, mos).then(
        (delta) => {
          if (delta.add.length || delta.remove.length) {
            observer.next(delta);
          }
          this.iterateAfter(observer, filter, interval, mos);
        },
        () => {
          this.iterateAfter(observer, filter, interval, mos);
        }
      );
    }, interval);
  }

  private checkForUpdates(filter: object, mos: string[]) {
    return this.fetchMatchingManagedObjects(filter).then((sources) => this.toDelta(sources, mos));
  }

  async toDelta(matches: Array<IManagedObject>, old: Array<string>) {
    const delta = {
      add: new Array<IManagedObject>(),
      remove: new Array<string>(),
    };
    for (const mo of matches) {
      if (!old.includes(mo.id)) {
        delta.add.push(mo);
      }
    }

    const toRemoveIds = old.filter((id) => matches.find((m) => m.id === id) === undefined);
    toRemoveIds.forEach((id) => delta.remove.push(id));

    return delta;
  }

  private async fetchMatchingManagedObjects(filter: object) {
    const result = new Array<IManagedObject>();
    const queryParams = {
      withTotalPages: true,
      pageSize: 2000,
      ...filter,
    };

    let res = await this.inventory.list(queryParams);
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
