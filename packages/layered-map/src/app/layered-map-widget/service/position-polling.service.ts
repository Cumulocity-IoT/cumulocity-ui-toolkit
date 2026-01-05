import { Injectable } from '@angular/core';
import { InventoryService } from '@c8y/client';
import { Observable, Subscriber } from 'rxjs';
import { PositionUpdateManagedObject } from '../layered-map-widget.model';

@Injectable()
export class PositionPollingService {
  constructor(private inventory: InventoryService) {}

  createPolling$(filterQuery: string, interval: number): Observable<PositionUpdateManagedObject[]> {
    return new Observable<PositionUpdateManagedObject[]>((observer) => {
      const currentDate = new Date().toISOString();

      this.iterateAfter(observer, currentDate, filterQuery, interval);
    });
  }

  private iterateAfter(
    observer: Subscriber<PositionUpdateManagedObject[]>,
    currentDate: string,
    filterQuery: string,
    interval: number
  ) {
    if (observer.closed) {
      return;
    }
    setTimeout(() => {
      this.checkForUpdates(filterQuery, currentDate).then(
        (result) => {
          if (result.data.length) {
            observer.next(result.data as PositionUpdateManagedObject[]);
            const moWithLatestDate = result.data.reduce((a, b) =>
              a.lastUpdated > b.lastUpdated ? a : b
            );

            currentDate = new Date(moWithLatestDate.lastUpdated).toISOString();
          }
          this.iterateAfter(observer, currentDate, filterQuery, interval);
        },
        () => {
          this.iterateAfter(observer, currentDate, filterQuery, interval);
        }
      );
    }, interval);
  }

  private checkForUpdates(filterQuery: string, lastUpdate: string) {
    const query = `$filter=(${filterQuery} and lastUpdated.date gt '${lastUpdate}')`;
    const filter = {
      pageSize: 200,
      withTotalPages: false,
      query,
    };
    return this.inventory.list(filter);
  }
}
