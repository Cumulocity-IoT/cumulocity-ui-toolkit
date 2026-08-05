import { inject } from '@angular/core';
import { IManagedObject, InventoryService } from '@c8y/client';
import { isEmpty } from 'lodash';
import { EMPTY, from, Observable, timer } from 'rxjs';
import { catchError, exhaustMap, filter } from 'rxjs/operators';
import { MyLayer, PollingDelta, QueryLayerConfig } from '../layered-map-widget.model';

/** Inventory page size used when resolving source ids to managed objects. */
const PAGE_SIZE = 100;

/**
 * Shared polling behaviour for layers whose members are derived from the *sources*
 * of some other collection (alarms, events).
 *
 * `AlarmPollingService` and `EventPollingService` were byte-identical apart from
 * the collection they query, so only {@link fetchMatchingSourceIds} differs.
 */
export abstract class SourceIdPollingService {
  protected inventory = inject(InventoryService);

  /**
   * Returns the ids of the managed objects that currently match the layer query.
   * Implemented per collection (alarms, events).
   */
  protected abstract fetchMatchingSourceIds(config: QueryLayerConfig): Promise<Set<string>>;

  /** Emits only when the layer membership actually changed. */
  protected createPollingFor(layer: MyLayer, interval: number): Observable<PollingDelta> {
    return timer(interval, interval).pipe(
      // Catching inside the projection keeps the outer timer alive: a failed
      // request skips this tick instead of terminating the polling for good.
      exhaustMap(() => from(this.checkForUpdates(layer)).pipe(catchError(() => EMPTY))),
      filter((delta) => delta.add.length > 0 || delta.remove.length > 0)
    );
  }

  private checkForUpdates(layer: MyLayer): Promise<PollingDelta> {
    return this.fetchMatchingSourceIds(layer.config).then((sources) =>
      this.toPollingDelta(sources, layer)
    );
  }

  /** Diffs the freshly matched source ids against the layer's current members. */
  protected async toPollingDelta(sources: Set<string>, layer: MyLayer): Promise<PollingDelta> {
    const delta = {
      add: new Array<IManagedObject>(),
      remove: new Array<string>(),
    };

    const idsToAdd = [...sources].filter((source) => !layer.devices.includes(source));

    if (!isEmpty(idsToAdd)) {
      delta.add.push(...(await this.resolveManagedObjects(idsToAdd)));
    }

    layer.devices.filter((id) => !sources.has(id)).forEach((id) => delta.remove.push(id));

    return delta;
  }

  /** Resolves ids to positioned managed objects, paging when necessary. */
  protected async resolveManagedObjects(ids: string[]): Promise<IManagedObject[]> {
    const filterOptions = {
      ids: ids.toString(),
      fragmentType: 'c8y_Position',
      withChildren: false,
      pageSize: PAGE_SIZE,
    };

    if (ids.length <= PAGE_SIZE) {
      return this.inventory
        .list({ ...filterOptions, withTotalPages: false })
        .then((res) => res.data);
    }

    const mos: IManagedObject[] = [];
    let res = await this.inventory.list({ ...filterOptions, withTotalPages: true });

    while (res.data.length) {
      mos.push(...res.data);

      if (!res.paging?.nextPage) {
        break;
      }

      res = await res.paging.next();
    }

    return mos;
  }
}
