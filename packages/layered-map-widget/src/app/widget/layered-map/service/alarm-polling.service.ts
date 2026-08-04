import { inject, Injectable } from '@angular/core';
import { AlarmService } from '@c8y/client';
import { Observable } from 'rxjs';
import { normalizeQueryFilter } from '~components/_formly-fields/query-forms/formly-query-blocks';
import {
  isQueryLayerConfig,
  MyLayer,
  PollingDelta,
  QueryLayerConfig,
} from '../layered-map-widget.model';
import { SourceIdPollingService } from './source-id-polling.service';

const FETCH_INTERVAL = 5000;
const PAGE_SIZE = 100;

@Injectable()
export class AlarmPollingService extends SourceIdPollingService {
  private alarm = inject(AlarmService);

  createPolling$(layer: MyLayer, interval = FETCH_INTERVAL): Observable<PollingDelta> {
    if (!isQueryLayerConfig(layer.config) || layer.config.type !== 'Alarm') {
      throw new Error('Layer is not alarm layer!');
    }

    return this.createPollingFor(layer, interval);
  }

  /** The source ids of all alarms matching the layer query. */
  protected async fetchMatchingSourceIds(config: QueryLayerConfig): Promise<Set<string>> {
    const result = new Set<string>();
    const filter = {
      withTotalPages: true,
      pageSize: PAGE_SIZE,
      ...normalizeQueryFilter(config.filter),
    };

    let res = await this.alarm.list(filter);

    while (res.data.length) {
      res.data.forEach((alarm) => result.add(alarm.source.id));

      if (!res.paging?.nextPage) {
        break;
      }

      res = await res.paging.next();
    }

    return result;
  }
}
