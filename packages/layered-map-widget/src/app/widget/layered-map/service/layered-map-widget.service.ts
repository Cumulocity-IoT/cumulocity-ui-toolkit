import { inject, Injectable } from '@angular/core';
import { EventService } from '@c8y/client';
import { has, isEmpty } from 'lodash';
import { LatLng, polyline, Polyline } from 'leaflet';
import { ILayeredMapWidgetConfig, ITrack } from '../layered-map-widget.model';
import { ILocationUpdateEvent, isLocationUpdateEvent } from '~services/location-realtime.service';

export type { ILocationUpdateEvent };

@Injectable()
export class LayeredMapWidgetService {
  private eventService = inject(EventService);

  getTrack(config: ILayeredMapWidgetConfig): ITrack | undefined {
    if (
      has(config, 'selectedTrack') &&
      has(config, 'tracks') &&
      config.selectedTrack !== null &&
      !isEmpty(config.tracks)
    ) {
      return config.tracks?.find((t) => t.name === config.selectedTrack);
    }

    return undefined;
  }

  createLines(coords: LatLng[]): Polyline[] {
    const last = coords.length - 1;
    const circuit: Polyline[] = [];

    for (let i = 0; i < last; i++) {
      const line = polyline([coords[i], coords[i + 1]]);

      circuit.push(line);
    }

    return circuit;
  }

  async fetchCoordinates(startDate: string, endDate: string, deviceId: number) {
    const events = await this.fetchHistoricEvents(startDate, endDate, deviceId);

    if (isEmpty(events)) {
      return null;
    }
    const coords = events
      .map((e) => e.c8y_Position)
      .map((pos) => new LatLng(pos.lat, pos.lng, pos.alt));
    return coords;
  }

  private fetchHistoricEvents(
    startDate: string,
    endDate: string,
    deviceId: number
  ): Promise<ILocationUpdateEvent[]> {
    const filter = {
      dateFrom: startDate,
      dateTo: endDate,
      fragmentType: 'c8y_Position',
      pageSize: 2000,
      revert: true,
      source: deviceId,
    };
    // Only events that really carry coordinates may be handed on — `fetchCoordinates`
    // dereferences `c8y_Position` unconditionally.
    return this.eventService
      .list(filter)
      .then((result) => result.data.filter(isLocationUpdateEvent));
  }
}
