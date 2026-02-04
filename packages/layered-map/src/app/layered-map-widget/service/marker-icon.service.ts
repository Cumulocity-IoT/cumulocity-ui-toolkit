import { Injectable } from '@angular/core';
import { divIcon, DivIcon } from 'leaflet';
@Injectable({ providedIn: 'root' })
export class MarkerIconService {
  getIcon(icon = 'globe', classNames = 'text-primary', color?: string): DivIcon {
    const style = color?.length > 0 ? `style='color: ${color};'` : '';
    const leafletMarkerIcon = divIcon({
      html: `<div class="dlt-c8y-icon-marker icon-3x ${classNames}" ${style}><i class="dlt-c8y-icon-${
        icon || 'data-transfer'
      }" /></div>`,
      className: 'c8y-map-marker-icon',
    });
    return leafletMarkerIcon;
  }
}
