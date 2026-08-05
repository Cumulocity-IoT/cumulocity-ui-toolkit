import { Injectable } from '@angular/core';
import { divIcon, DivIcon } from 'leaflet';
import { escapeHtml, safeCssColor, safeIconName } from '../utils/sanitize';

@Injectable({ providedIn: 'root' })
export class MarkerIconService {
  getIcon(icon = 'globe', classNames = 'text-primary', color = '#ffffff'): DivIcon {
    // `icon`, `classNames` and `color` come from persisted layer configuration,
    // which is untrusted input — see utils/sanitize.ts.
    const safeIcon = safeIconName(icon) ?? 'data-transfer';
    const safeColor = safeCssColor(color) ?? '#ffffff';
    const style = `style="color: ${safeColor};"`;
    const leafletMarkerIcon = divIcon({
      html: `<div class="dlt-c8y-icon-marker icon-3x ${escapeHtml(
        classNames
      )}" ${style}><i class="dlt-c8y-icon-${safeIcon}" /></div>`,
      className: 'c8y-map-marker-icon',
    });
    return leafletMarkerIcon;
  }
}
