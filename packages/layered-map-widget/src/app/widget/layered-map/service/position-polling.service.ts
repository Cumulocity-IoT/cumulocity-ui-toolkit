import { inject, Injectable } from '@angular/core';
import { IManagedObject, InventoryService } from '@c8y/client';
import type { LatLngBounds } from 'leaflet';
import { EMPTY, from, Observable, timer } from 'rxjs';
import { catchError, exhaustMap, filter, map, tap } from 'rxjs/operators';

@Injectable()
export class PositionPollingService {
  private inventory = inject(InventoryService);

  /**
   * Periodic delta poll for position updates. `buildFilter` is evaluated on every
   * tick so the query always reflects the current map viewport (bounding box) —
   * off-screen movers are not fetched. Only devices changed since the previous
   * tick are returned (delta via `lastUpdated`).
   */
  createPolling$(buildFilter: () => string, interval: number): Observable<IManagedObject[]> {
    let currentDate = new Date().toISOString();

    return timer(interval, interval).pipe(
      // Catching inside the projection keeps the outer timer alive: a failed
      // request skips this tick instead of terminating the polling for good.
      exhaustMap(() =>
        from(this.checkForUpdates(buildFilter(), currentDate)).pipe(catchError(() => EMPTY))
      ),
      filter((result) => result.data.length > 0),
      tap((result) => {
        const moWithLatestDate = result.data.reduce((a, b) =>
          a.lastUpdated > b.lastUpdated ? a : b
        );

        currentDate = new Date(moWithLatestDate.lastUpdated).toISOString();
      }),
      map((result) => result.data)
    );
  }

  /**
   * Full (non-delta) fetch of all managed objects matching `filterQuery`. Used to
   * resync positions when the viewport grows/shifts (zoom-out / pan): the delta
   * cursor may have skipped past devices that moved while off-screen, so a full
   * fetch of the newly visible area is required to bring their markers up to date.
   */
  async fetchOnce(filterQuery: string): Promise<IManagedObject[]> {
    const result = new Array<IManagedObject>();
    let res = await this.inventory.list({
      pageSize: 200,
      withTotalPages: true,
      query: `$filter=(${filterQuery})`,
    });

    while (res.data.length) {
      res.data.forEach((mo) => result.push(mo));

      if (!res.paging?.nextPage) {
        break;
      }
      res = await res.paging.next();
    }

    return result;
  }

  /**
   * Builds a `$filter`-compatible query clause that restricts results to managed
   * objects with a `c8y_Position` fragment inside the given map viewport.
   *
   * The longitude clause is omitted when the viewport spans the full world or
   * wraps around the antimeridian (east − west ≥ 360°) so no positions are missed.
   *
   * @param bounds Current Leaflet map bounds.
   * @returns OData clause string, ready for use in a `query` parameter.
   */
  buildViewportFilter(bounds: LatLngBounds): string {
    const latMin = Math.max(bounds.getSouth(), -90);
    const latMax = Math.min(bounds.getNorth(), 90);
    const west = bounds.getWest();
    const east = bounds.getEast();

    let clause =
      `has(c8y_Position)` + ` and c8y_Position.lat gt ${latMin} and c8y_Position.lat lt ${latMax}`;

    if (west < east && east - west < 360) {
      clause += ` and c8y_Position.lng gt ${west} and c8y_Position.lng lt ${east}`;
    }

    return clause;
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
