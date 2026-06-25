import {
  AfterViewInit,
  Component,
  ElementRef,
  Input,
  input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import type * as L from 'leaflet';
import { isEmpty, isNil } from 'lodash';
import { fromEvent, Subject, Subscription } from 'rxjs';
import { ILayeredMapWidgetConfig, isQueryLayerConfig, MyLayer } from './layered-map-widget.model';
import {
  BASE_TILE_LAYERS,
  customEntryToDef,
  DEFAULT_BASE_TILE_LAYER_ID,
} from './base-tile-layers';
import { CustomBaseTileLayerService } from './service/custom-base-tile-layer.service';
import { LayerService } from './service/layer.service';
import { InventoryPollingService } from './service/inventory-polling.service';
import { debounceTime, filter, takeUntil } from 'rxjs/operators';
import { AlarmPollingService } from './service/alarm-polling.service';
import { PositionPollingService } from './service/position-polling.service';
import { EventPollingService } from './service/event-polling.service';
import { IManagedObject } from '@c8y/client';
import { CoreModule, DashboardChildComponent } from '@c8y/ngx-components';

@Component({
  selector: 'layered-map-widget',
  providers: [
    InventoryPollingService,
    AlarmPollingService,
    EventPollingService,
    PositionPollingService,
  ],
  styleUrls: ['./layered-map-widget.component.less'],
  templateUrl: './layered-map-widget.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class LayeredMapWidgetComponent implements AfterViewInit, OnDestroy {
  map!: L.Map;
  leaf!: typeof L;
  allLayers: MyLayer[] = [];
  @ViewChild('mapContainer', { read: ElementRef, static: true }) mapReference!: ElementRef;

  cfg!: ILayeredMapWidgetConfig;

  @Input() config!: ILayeredMapWidgetConfig;

  options = input<L.MapOptions>({
    zoom: 15,
    attributionControl: false,
  });

  private layerSubs: Map<MyLayer, Subscription> = new Map();
  private positionUpdateSub: Subscription | null = null;
  // Bounds covered by the last full position resync; used to decide whether a
  // viewport change revealed area we still need to load.
  private lastPolledBounds: L.LatLngBounds | null = null;

  private destroy$ = new Subject<void>();

  constructor(
    private layerService: LayerService,
    private inventoryPollingService: InventoryPollingService,
    private positionPollingService: PositionPollingService,
    private eventPollingService: EventPollingService,
    private alarmPollingService: AlarmPollingService,
    private customBaseTileLayerService: CustomBaseTileLayerService,
    child: DashboardChildComponent
  ) {
    child.changeEnd
      .pipe(
        filter((child) => child.lastChange === 'resize'),
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        this.map?.invalidateSize();
      });
  }

  // eslint-disable-next-line @typescript-eslint/no-misused-promises
  async ngAfterViewInit() {
    [this.leaf] = await Promise.all([
      import('leaflet'),
      this.customBaseTileLayerService.load().then((layers) => {
        this.customTileLayers = layers;
      }),
    ]);
    this.initMap();
  }

  private customTileLayers: import('./base-tile-layers').CustomBaseTileLayerEntry[] = [];

  private initMap() {
    const options: L.MapOptions = this.options() ?? {
      // zoom: 15,
      // center: this.leaf.latLng(29.3117, 47.4818),
      attributionControl: false,
      scrollWheelZoom: false,
    };

    this.map = this.leaf.map(this.mapReference.nativeElement as HTMLElement, options);

    if (this.config?.manualCenter) {
      const { lat, long, zoomLevel } = this.config.manualCenter;

      if (!isNil(lat) && !isNil(long)) {
        const bounds = this.leaf.latLng(lat, long);

        this.map.setView(bounds, zoomLevel ?? 10);
      }
    }

    fromEvent<L.PopupEvent>(this.map, 'popupopen')
      .pipe(takeUntil(this.destroy$))
      .subscribe((e) => this.onPopupOpen(e));

    fromEvent<L.PopupEvent>(this.map, 'popupclose')
      .pipe(takeUntil(this.destroy$))
      .subscribe((e) => this.onPopupClose(e));

    fromEvent<L.LayersControlEvent>(this.map, 'overlayadd')
      .pipe(takeUntil(this.destroy$))
      .subscribe((e) => this.onOverlayAdd(e));

    fromEvent<L.LayersControlEvent>(this.map, 'overlayremove')
      .pipe(takeUntil(this.destroy$))
      .subscribe((e) => this.onOverlayRemove(e));

    // this.map!.invalidateSize();
    this.draw(this.config);
  }

  onPopupOpen(event: L.PopupEvent): void {
    const popup = event.popup as L.Popup & { ref: { instance: { onShow(): void } } };

    popup.ref.instance.onShow();
    // const latLng = popup.getLatLng();
    // if (latLng) {
    //   this.map.setView(latLng, 13);
    // }
  }

  onPopupClose(event: L.PopupEvent): void {
    const popup = event.popup as L.Popup & { ref: { instance: { onHide(): void } } };

    popup.ref.instance.onHide();
  }

  onOverlayAdd(event: L.LayersControlEvent): void {
    const layer = this.allLayers.find((l) => l.group === event.layer);

    if (!layer) {
      return;
    }

    if (layer.initialLoad === undefined) {
      this.layerService.load(layer);
    }
    void layer.initialLoad?.then(() => {
      this.startPolling(layer);
      this.refitBoundsIfAutoCenter();
    });
  }

  onOverlayRemove(event: L.LayersControlEvent): void {
    const layer = this.allLayers.find((l) => l.group === event.layer);

    if (layer) {
      this.stopPolling(layer);
      delete layer.initialLoad;
      layer.active = false;
      this.refitBoundsIfAutoCenter();
    }
  }

  private refitBoundsIfAutoCenter(): void {
    if (!this.cfg?.autoCenter) {
      return;
    }

    const visibleLayers = this.allLayers.filter((l) => this.map.hasLayer(l.group));
    const bounds = this.layerService.extractMinMaxBounds(visibleLayers);

    if (bounds) {
      this.map.fitBounds(bounds);
    }
  }

  private draw(config: ILayeredMapWidgetConfig) {
    const asBool = (v: unknown): boolean => v === true || v === 'true';

    if (config.autoCenter !== undefined) config.autoCenter = asBool(config.autoCenter);
    if (config.positionPolling)
      config.positionPolling.enabled = asBool(config.positionPolling.enabled);
    config.layers?.forEach((l) => {
      l.config.enablePolling = asBool(l.config.enablePolling);
    });

    this.cfg = config;

    const selectedId = config.baseTileLayerId ?? DEFAULT_BASE_TILE_LAYER_ID;
    const customEntry = this.customTileLayers.find((l) => l.id === selectedId);
    const tileLayerDef =
      (customEntry ? customEntryToDef(customEntry) : null) ??
      BASE_TILE_LAYERS.find((l) => l.id === selectedId) ??
      BASE_TILE_LAYERS.find((l) => l.id === DEFAULT_BASE_TILE_LAYER_ID)!;

    const baseLayer = this.leaf.tileLayer(tileLayerDef.url, {
      maxZoom: tileLayerDef.maxZoom,
      maxNativeZoom: tileLayerDef.maxNativeZoom,
      minZoom: 2,
      detectRetina: true,
      attribution: tileLayerDef.attribution,
      ...(tileLayerDef.subdomains ? { subdomains: tileLayerDef.subdomains } : {}),
    });

    const layerControl = this.leaf.control.layers().addTo(this.map);

    layerControl.addBaseLayer(baseLayer, tileLayerDef.label);
    baseLayer.addTo(this.map);

    if (config.layers && !isEmpty(config.layers)) {
      const markerBasedLayers = config.layers.filter((l) => isQueryLayerConfig(l.config));

      this.allLayers = this.layerService.createLayers(markerBasedLayers);

      for (const layer of this.allLayers) {
        layerControl.addOverlay(layer.group, this.buildLayerLabel(layer.config));

        if (layer.active) {
          layer.group.addTo(this.map);
        }
      }

      if (config.autoCenter) {
        void Promise.all(this.allLayers.map((layer) => layer.initialLoad)).then(() => {
          const bounds = this.layerService.extractMinMaxBounds(this.allLayers);

          if (bounds) {
            this.map.fitBounds(bounds);
          }
        });
      } else if (this.config?.manualCenter) {
        const { lat, long, zoomLevel } = this.config.manualCenter;

        if (lat && long) {
          const bounds = this.leaf.latLng(lat, long);

          this.map.setView(bounds, zoomLevel);
        }
      }
    }

    // const track = this.widgetService.getTrack(config);
    // if (track && this.map) {
    //   const line = this.leaf.polyline(track.coords);
    //   line.addTo(this.map);
    //   this.map.fitBounds(line.getBounds());
    // }

    if (this.config.positionPolling?.enabled) {
      this.createPositionUpdatePolling(this.allLayers);
    }
  }

  private startPolling(layer: MyLayer) {
    this.stopPolling(layer);
    const cfg = layer.config;

    if (!cfg.enablePolling) {
      return;
    }

    if (isQueryLayerConfig(cfg)) {
      if (cfg.type === 'Alarm') {
        const sub = this.alarmPollingService
          .createPolling$(layer, cfg.pollingInterval * 1000)
          .subscribe((delta) => this.layerService.updatePollingDelta(delta, layer));

        this.layerSubs.set(layer, sub);
      } else if (cfg.type === 'Inventory') {
        const sub = this.inventoryPollingService
          .createPolling$(cfg.filter, layer, cfg.pollingInterval * 1000)
          .subscribe((delta) => this.layerService.updatePollingDelta(delta, layer));

        this.layerSubs.set(layer, sub);
      } else if (cfg.type === 'Event') {
        const sub = this.eventPollingService
          .createPolling$(layer, cfg.pollingInterval * 1000)
          .subscribe((delta) => this.layerService.updatePollingDelta(delta, layer));

        this.layerSubs.set(layer, sub);
      }
    }
  }

  private stopPolling(layer: MyLayer) {
    if (this.layerSubs.has(layer)) {
      this.layerSubs.get(layer)?.unsubscribe();
      this.layerSubs.delete(layer);
    }
  }

  private createPositionUpdatePolling(layers: MyLayer[]) {
    if (this.positionUpdateSub) {
      return;
    }

    const interval = +(this.config.positionPolling?.interval ?? 0) * 1000 || 5000;

    this.lastPolledBounds = this.map.getBounds();

    // Periodic delta poll, scoped to the current viewport (bounding box).
    this.positionUpdateSub = this.positionPollingService
      .createPolling$(
        () => this.positionPollingService.buildViewportFilter(this.map.getBounds()),
        interval
      )
      .pipe(filter((updates) => !isEmpty(updates)))
      .subscribe((positionUpdates) => this.onPositionUpdate(layers, positionUpdates));

    // Zooming/panning to reveal area we have not fully loaded (bounds grow or
    // shift) triggers an immediate full resync. Zooming in stays within
    // lastPolledBounds, so `contains` is true and we skip the reload.
    const moveSub = fromEvent(this.map, 'moveend')
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => {
        const bounds = this.map.getBounds();

        if (!this.lastPolledBounds?.contains(bounds)) {
          this.lastPolledBounds = bounds;
          void this.resyncPositions(layers);
        }
      });

    this.positionUpdateSub.add(moveSub);
  }

  private async resyncPositions(layers: MyLayer[]): Promise<void> {
    const updates = await this.positionPollingService.fetchOnce(
      this.positionPollingService.buildViewportFilter(this.map.getBounds())
    );

    if (!isEmpty(updates)) {
      this.onPositionUpdate(layers, updates);
    }
  }

  private onPositionUpdate(layers: MyLayer[], positionUpdates: IManagedObject[]): void {
    for (const layer of layers) {
      const matches = positionUpdates.filter((mo) => layer.devices.includes(mo.id));

      if (!isEmpty(matches)) {
        this.layerService.updateManagedObjects(matches, layer);
      }
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    try {
      this.tearDownRealtime();
      this.layerService.tearDown(this.allLayers);
      this.map.clearAllEventListeners();
    } catch (e) {
      console.warn(e);
    }
  }

  private buildLayerLabel(cfg: import('./layered-map-widget.model').BasicLayerConfig): string {
    const dot = cfg.color
      ? `<span class="lm-layer-dot" style="background:${cfg.color};"></span>`
      : '';
    const icon = cfg.icon
      ? `<i class="dlt-c8y-icon-${cfg.icon} lm-layer-icon"${cfg.color ? ` style="color:${cfg.color};"` : ''}></i>`
      : '';
    return `<span class="lm-layer-label">${dot}${icon}<span>${cfg.name}</span></span>`;
  }

  private tearDownRealtime(): void {
    if (!isEmpty(this.layerSubs)) {
      this.layerSubs.forEach((sub) => sub.unsubscribe());
    }
    this.positionUpdateSub?.unsubscribe();
  }
}
