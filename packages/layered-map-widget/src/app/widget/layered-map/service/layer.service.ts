import { Injectable } from '@angular/core';
import { IManagedObject } from '@c8y/client';
import { FeatureGroup, LatLng, latLng, Marker } from 'leaflet';
import { has, isEmpty, set } from 'lodash';
import {
  BasicLayerConfig,
  isQueryLayerConfig,
  LayerConfig,
  MyLayer,
  PollingDelta,
} from '../layered-map-widget.model';
import { MarkerIconService } from './marker-icon.service';
import { PopUpService } from './popup.service';
import { QueryLayerService } from './query-layer.service';

type Position = { lat: number; lng: number; alt?: number };
type AlarmStatus = { critical?: number; major?: number; minor?: number; warning?: number };

@Injectable({ providedIn: 'root' })
export class LayerService {
  constructor(
    private popupService: PopUpService,
    private markerIconService: MarkerIconService,
    private queryLayerService: QueryLayerService
  ) {}

  createLayers(configs: LayerConfig<BasicLayerConfig>[]): MyLayer[] {
    return configs.map((cfg) => this.createLayer(cfg));
  }

  load(layer: MyLayer) {
    const cfg = layer.config;

    if (isQueryLayerConfig(cfg)) {
      layer.initialLoad = this.fechtRequestForType(cfg.type, cfg.filter).then((devices) =>
        this.responseHandlerForType(cfg.type, devices, layer)
      );
    }
  }

  createLayer(setup: LayerConfig<BasicLayerConfig>) {
    return Object.assign(new MyLayer(), setup);
  }

  updateMarkerIcon(
    deviceId: string,
    layer: MyLayer & LayerConfig<BasicLayerConfig>,
    status: {
      critical?: number;
      major?: number;
      minor?: number;
      warning?: number;
    }
  ) {
    let classNames = '';

    if (status.critical) {
      classNames = `status critical`;
    } else if (status.major) {
      classNames = 'status major';
    } else if (status.minor) {
      classNames = 'status minor';
    } else if (status.warning) {
      classNames = 'status warning';
    } else {
      classNames = '';
    }

    const marker = layer.markerCache.get(deviceId);

    if (!marker) {
      return;
    }

    const icon = this.markerIconService.getIcon(layer.config.icon, classNames);

    marker.setIcon(icon);
  }

  updateManagedObjects(mos: IManagedObject[], layer: MyLayer): void {
    for (const mo of mos) {
      if (isQueryLayerConfig(layer.config) && layer.config.type === 'Alarm') {
        this.updateMarkerIcon(mo.id, layer, mo['c8y_ActiveAlarmsStatus'] as AlarmStatus);
      }
      const marker = this.updatePosition(layer, mo.id, mo['c8y_Position'] as Position | undefined);

      if (marker) {
        this.popupService.getPopupComponent(marker)?.onUpdate(mo);
      }
    }
  }

  updatePollingDelta(delta: PollingDelta, layer: MyLayer): void {
    for (const d of delta.add) {
      layer.devices.push(d.id);

      if (has(d, 'c8y_Position') && !isEmpty(d.c8y_Position)) {
        this.updatePosition(layer, d.id, d.c8y_Position as Position | undefined);

        if (isQueryLayerConfig(layer.config) && layer.config.type === 'Alarm') {
          this.updateMarkerIcon(d.id, layer, d['c8y_ActiveAlarmsStatus'] as AlarmStatus);
        }
      }
    }

    for (const toDeleteId of delta.remove) {
      layer.devices = layer.devices.filter((id) => id !== toDeleteId);

      if (layer.coordinates.has(toDeleteId)) {
        layer.coordinates.delete(toDeleteId);
      }

      if (layer.markerCache.has(toDeleteId)) {
        const markerToDelete = layer.markerCache.get(toDeleteId);

        this.popupService.destroyPopup(markerToDelete);
        layer.group.removeLayer(markerToDelete);
        layer.markerCache.delete(toDeleteId);
      }
    }
  }

  /**
   * Destroys all markers (and their popup components) of the given layers and
   * clears their caches. Call this when tearing the widget down so popup
   * components do not leak in the {@link PopUpService} / change-detection loop.
   */
  tearDown(layers: MyLayer[]): void {
    for (const layer of layers) {
      layer.markerCache.forEach((marker) => this.popupService.destroyPopup(marker));
      layer.group.clearLayers();
      layer.markerCache.clear();
      layer.coordinates.clear();
    }
  }

  createLayerGroup(layer: MyLayer): void {
    const markers = [...layer.coordinates.keys()].map((key) => {
      const coord = layer.coordinates.get(key);

      const marker = this.createMarker(key, coord, layer);

      layer.markerCache.set(key, marker);

      return marker;
    });

    layer.group = new FeatureGroup(markers);
  }

  extractMinMaxBounds(allLayers: MyLayer[]) {
    const markers = allLayers.flatMap((l) => [...l.markerCache.values()]);

    if (isEmpty(markers)) {
      return undefined;
    }

    return new FeatureGroup(markers).getBounds();
  }

  private fechtRequestForType(type: string, filter: object) {
    switch (type) {
      case 'Alarm':
        return this.queryLayerService.fetchByAlarmQuery(filter);
      case 'Inventory':
        return this.queryLayerService.fetchByInventoryQuery(filter);
      case 'Event':
        return this.queryLayerService.fetchByEventQuery(filter);
      default:
        return Promise.reject(new Error(`Unknown type: ${type}`));
    }
  }

  private responseHandlerForType(type: string, devices: IManagedObject[], layer: MyLayer) {
    layer.devices = devices.map((d) => d.id);

    if (type === 'Alarm') {
      devices.forEach((d) => {
        this.updatePosition(layer, d.id, d['c8y_Position'] as Position | undefined);
        this.updateMarkerIcon(d.id, layer, d['c8y_ActiveAlarmsStatus'] as AlarmStatus);
      });
    } else {
      layer.devices = devices.map((d) => d.id);
      devices.forEach((d) =>
        this.updatePosition(layer, d.id, d['c8y_Position'] as Position | undefined)
      );
    }
  }

  private createMarker(deviceId: string, coordinate: LatLng, layer: MyLayer) {
    const hasCustomColor = !!layer.config.color?.length;
    const color = hasCustomColor ? layer.config.color : '#ffffff';
    // `.text-primary` sets its colour with `!important`, which overrides the inline
    // colour and would force every marker to the brand colour. Only use it as a
    // fallback when no custom colour is configured.
    const classNames = hasCustomColor ? '' : 'text-primary';
    const icon = this.markerIconService.getIcon(layer.config.icon, classNames, color);
    const popup = this.popupService.getPopup({ deviceId, layer });

    const marker = new Marker(coordinate, {
      icon,
    });

    marker.bindPopup(popup.html, {
      offset: [0, -24],
      minWidth: 160,
      maxWidth: 280,
      autoPan: true,
    });
    set(marker.getPopup(), 'ref', popup.ref);

    return marker;
  }

  private updatePosition(
    layer: MyLayer,
    id: string,
    position: Position | undefined
  ): Marker | undefined {
    let marker: Marker | undefined = undefined;

    if (!position) {
      if (layer.coordinates.has(id)) {
        const staleMarker = layer.markerCache.get(id);

        if (staleMarker) {
          this.popupService.destroyPopup(staleMarker);
          layer.group.removeLayer(staleMarker);
        }

        layer.coordinates.delete(id);
        layer.markerCache.delete(id);
      }

      return marker;
    }

    // we haven't had any position yet
    if (!layer.coordinates.has(id)) {
      const coordinate = latLng(position);

      layer.coordinates.set(id, coordinate);
      marker = this.createMarker(id, coordinate, layer);
      layer.markerCache.set(id, marker);
      layer.group.addLayer(marker);
    } else {
      const oldCoord = layer.coordinates.get(id);
      const newCoord = latLng(position);

      marker = layer.markerCache.get(id);

      if (oldCoord.distanceTo(newCoord) > 0) {
        layer.coordinates.set(id, newCoord);
        marker.setLatLng(newCoord);
      }
    }

    return marker;
  }
}
