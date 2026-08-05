import { inject, Injectable } from '@angular/core';
import { EventService } from '@c8y/client';
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
export class EventPollingService extends SourceIdPollingService {
  private event = inject(EventService);

  createPolling$(layer: MyLayer, interval = FETCH_INTERVAL): Observable<PollingDelta> {
    if (!isQueryLayerConfig(layer.config) || layer.config.type !== 'Event') {
      throw new Error('Layer is not event layer!');
    }

    return this.createPollingFor(layer, interval);
  }

  /** The source ids of all events matching the layer query. */
  protected async fetchMatchingSourceIds(config: QueryLayerConfig): Promise<Set<string>> {
    const result = new Set<string>();
    const filter = {
      withTotalPages: true,
      pageSize: PAGE_SIZE,
      ...normalizeQueryFilter(config.filter),
    };

    let res = await this.event.list(filter);

    while (res.data.length) {
      res.data.forEach((event) => result.add(event.source.id));

      if (!res.paging?.nextPage) {
        break;
      }

      res = await res.paging.next();
    }

    return result;
  }
}
