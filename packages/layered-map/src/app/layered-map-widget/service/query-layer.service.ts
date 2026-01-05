import { Injectable } from '@angular/core';
import { AlarmService, EventService, InventoryService } from '@c8y/client';
import { get, set } from 'lodash';
import { PositionUpdateManagedObject } from '../layered-map-widget.model';

@Injectable({
  providedIn: 'root',
})
export class QueryLayerService {
  constructor(
    private inventory: InventoryService,
    private alarm: AlarmService,
    private event: EventService
  ) {}

  async fetchByAlarmQuery(params: object): Promise<PositionUpdateManagedObject[]> {
    const result = new Map<string, PositionUpdateManagedObject | null>();
    const filter = {
      withTotalPages: true,
      pageSize: 200,
      ...this.normalize(params),
    };

    const resolvers: Promise<void>[] = [];

    let res = await this.alarm.list(filter);

    while (res.data.length) {
      const ids = res.data
        .filter((alarm) => !result.has(alarm.source.id))
        .map((alarm) => alarm.source.id);

      ids.forEach((id) => result.set(id, null));
      resolvers.push(
        this.resolveManagedObjects(ids).then((mos) =>
          mos.data.forEach((mo) => result.set(mo.id, mo as PositionUpdateManagedObject))
        )
      );

      if (!res.paging?.nextPage) {
        break;
      }
      res = await res.paging.next();
    }

    await Promise.all(resolvers);

    return [...result.values()].filter((mo) => mo !== null);
  }

  async fetchByInventoryQuery(params: object) {
    const result: PositionUpdateManagedObject[] = [];
    const filter = {
      withTotalPages: true,
      pageSize: 2000,
      ...this.normalize(params),
    };

    let res = await this.inventory.list(filter);

    while (res.data.length) {
      result.push(...(res.data as PositionUpdateManagedObject[]));

      if (res.data.length < (res.paging?.pageSize ?? -1)) {
        break;
      }

      if (!res.paging?.nextPage) {
        break;
      }
      res = await res.paging.next();
    }

    return result;
  }

  async fetchByEventQuery(params: object): Promise<PositionUpdateManagedObject[]> {
    const result = new Map<string, PositionUpdateManagedObject | null>();
    const filter = {
      withTotalPages: true,
      pageSize: 200,
      ...this.normalize(params),
    };
    const resolvers: Promise<void>[] = [];

    let res = await this.event.list(filter);

    while (res.data.length) {
      const ids = res.data
        .filter((event) => !result.has(event.source.id))
        .map((event) => event.source.id);

      ids.forEach((id) => result.set(id, null));
      resolvers.push(
        this.resolveManagedObjects(ids).then((mos) =>
          (mos.data as PositionUpdateManagedObject[]).forEach((mo) => result.set(mo.id, mo))
        )
      );

      if (!res.paging?.nextPage) {
        break;
      }
      res = await res.paging.next();
    }
    await Promise.all(resolvers);

    return [...result.values()].filter((mo) => mo !== null);
  }

  resolveManagedObjects(ids: string[]) {
    return this.inventory.list({
      ids: ids.toString(),
      withTotalPages: false,
      fragmentType: 'c8y_Position',
      withChildren: false,
      pageSize: 200,
    });
  }

  normalize(params: object) {
    for (const key of Object.keys(params)) {
      if (get(params, key) instanceof Date) {
        set(params, key, (<Date>get(params, key)).toISOString());
      }
    }

    return params;
  }
}
