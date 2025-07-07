import { Injectable } from '@angular/core';
import { FetchClient } from '@c8y/client';
import { throttle } from '@c8y/ngx-components';
import { isArray, isEmpty } from 'lodash';

interface NominatimLocationData {
  place_id: number;
  licence: string;
  osm_type: string;
  osm_id: number;
  lat: string;
  lon: string;
  class: string;
  type: string;
  place_rank: number;
  importance: number;
  addresstype: string;
  name: string;
  display_name: string;
  boundingbox: [string, string, string, string];
}
@Injectable()
export class LocationGeocoderService {
  geoCodeSearchUrl = `https://nominatim.openstreetmap.org`;

  @throttle(200)
  async geoCode(address: string): Promise<{ lat: number; lon: number } | undefined> {
    const response = await new FetchClient(`${this.geoCodeSearchUrl}`).fetch(
      `search?city=${address}&format=json`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
      }
    );

    const data = (await response.json()) as NominatimLocationData[];

    if (isArray(data) && !isEmpty(data)) {
      const { lat, lon } = data[0];
      return { lat: parseFloat(lat), lon: parseFloat(lon) };
    }

    return undefined;
  }
}
