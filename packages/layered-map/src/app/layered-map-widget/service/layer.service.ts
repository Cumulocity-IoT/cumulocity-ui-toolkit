import { Injectable } from '@angular/core';
import { FeatureGroup, LatLng, latLng, Marker } from 'leaflet';
import { flatten, has, isEmpty, set } from 'lodash';
import {
  BasicLayerConfig,
  isQueryLayerConfig,
  isWebMapServiceLayerConfig,
  LayerConfig,
  MyLayer,
  PollingDelta,
  PositionUpdateManagedObject,
} from '../layered-map-widget.model';
import { MarkerIconService } from './marker-icon.service';
import { PopUpService } from './popup.service';
import { QueryLayerService } from './query-layer.service';

@Injectable({ providedIn: 'root' })
export class LayerService {
  constructor(
    private popupService: PopUpService,
    private markerIconService: MarkerIconService,
    private queryLayerService: QueryLayerService
  ) {}

  createLayers(configs: LayerConfig<BasicLayerConfig>[]) {
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
    const layer = Object.assign(new MyLayer(), setup);

    if (isWebMapServiceLayerConfig(setup.config)) {
      layer.config.enablePolling = 'false';
      layer.config.icon = 'globe1';
      layer.initialLoad = Promise.resolve();
    }

    if (isQueryLayerConfig(setup.config)) {
      const config = setup.config;

      if (config.type === 'Alarm') {
        layer.initialLoad = this.queryLayerService
          .fetchByAlarmQuery(config.filter)
          .then((devices) => {
            layer.devices = devices.map((d) => d.id);
            devices.forEach((d) => {
              this.updatePosition(layer, d.id, d.c8y_Position);
              this.updateMarkerIcon(d.id, layer, d.c8y_ActiveAlarmsStatus);
            });
          });
      } else if (config.type === 'Inventory') {
        layer.initialLoad = this.queryLayerService
          .fetchByInventoryQuery(config.filter)
          .then((devices) => {
            layer.devices = devices.map((d) => d.id);
            devices.forEach((d) => this.updatePosition(layer, d.id, d.c8y_Position));
          });
      } else if (config.type === 'Event') {
        layer.initialLoad = this.queryLayerService
          .fetchByEventQuery(config.filter)
          .then((devices) => {
            layer.devices = devices.map((d) => d.id);
            devices.forEach((d) => this.updatePosition(layer, d.id, d.c8y_Position));
          });
      }
    }

    return layer;
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
    } else {
      classNames = 'status warning';
    }

    const marker = layer.markerCache.get(deviceId);
    const icon = this.markerIconService.getIcon(layer.config.icon, classNames);

    marker.setIcon(icon);
  }

  updateManagedObjects(mos: PositionUpdateManagedObject[], layer: MyLayer): void {
    for (const mo of mos) {
      this.updatePosition(layer, mo.id, mo.c8y_Position);

      if (isQueryLayerConfig(layer.config) && layer.config.type === 'Alarm') {
        this.updateMarkerIcon(mo.id, layer, mo.c8y_ActiveAlarmsStatus);
      }
      const marker = this.updatePosition(layer, mo.id, mo.c8y_Position);

      if (marker) {
        this.popupService.getPopupComponent(marker).onUpdate(mo);
      }
    }
  }

  updatePollingDelta(delta: PollingDelta, layer: MyLayer): void {
    for (const d of delta.add) {
      layer.devices.push(d.id);

      if (has(d, 'c8y_Position') && !isEmpty(d.c8y_Position)) {
        this.updatePosition(layer, d.id, d.c8y_Position);

        if (isQueryLayerConfig(layer.config) && layer.config.type === 'Alarm') {
          this.updateMarkerIcon(d.id, layer, d.c8y_ActiveAlarmsStatus);
        }
      }
    }

    if (delta.update?.length) {
      for (const d of delta.update) {
        if (isQueryLayerConfig(layer.config) && layer.config.type === 'Alarm') {
          this.updateMarkerIcon(d.id, layer, d.c8y_ActiveAlarmsStatus);
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

        layer.group.removeLayer(markerToDelete);
        layer.markerCache.delete(toDeleteId);
      }
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
    const markers = flatten(allLayers.map((l) => [...l.markerCache.values()]));

    if (isEmpty(markers)) {
      return undefined;
    }

    return new FeatureGroup(markers).getBounds();
  }

  private createMarker(deviceId: string, coordinate: LatLng, layer: MyLayer) {
    const color = layer.config.color;
    const icon = this.markerIconService.getIcon(layer.config.icon, 'text-primary', color);
    const popup = this.popupService.getPopup({ deviceId, layer });

    const marker = new Marker(coordinate, {
      icon,
    });

    marker.bindPopup(popup.html, { offset: [0, -24] });
    set(marker.getPopup(), 'ref', popup.ref);

    return marker;
  }

  private responseHandlerForType(
    type: string,
    devices: PositionUpdateManagedObject[],
    layer: MyLayer
  ) {
    layer.devices = devices.map((d) => d.id);

    if (type === 'Alarm') {
      devices.forEach((d) => {
        this.updatePosition(layer, d.id, d.c8y_Position);
        this.updateMarkerIcon(d.id, layer, d.c8y_ActiveAlarmsStatus);
      });
    } else {
      layer.devices = devices.map((d) => d.id);
      devices.forEach((d) => this.updatePosition(layer, d.id, d['c8y_Position']));
    }
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

  private updatePosition(
    layer: MyLayer,
    id: string,
    position: { lat: number; lng: number }
  ): Marker | undefined {
    let marker: Marker<any> | undefined = undefined;

    if (!position) {
      if (layer.coordinates.has(id)) {
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

      marker = layer.markerCache.get(id)!;

      if (oldCoord.distanceTo(newCoord) > 0) {
        layer.coordinates.set(id, newCoord);
        marker.setLatLng(newCoord);
      }
    }

    return marker;
  }
}
