import { CoreModule, DynamicComponent, OnBeforeSave } from '@c8y/ngx-components';
import { IManagedObject } from '@c8y/client';
import { Component, Input, OnInit } from '@angular/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ApplicationAvailabilityService } from '~services/application-availability.service';
import { DTM_CONTEXT_PATH } from '~services/dtm.service';
import { take, lastValueFrom } from 'rxjs';
import {
  BASE_TILE_LAYERS,
  CustomBaseTileLayerEntry,
  DEFAULT_BASE_TILE_LAYER_ID,
} from './base-tile-layers';
import { CustomBaseTileLayerService } from './service/custom-base-tile-layer.service';
import { CustomBaseLayerModalComponent } from './layer-config/custom-base-layer-modal.component';
import { EventLineCreatorModalComponent } from './event-line-creator/event-line-creator-modal.component';
import { DrawLineCreatorModalComponent } from './draw-line-creator/draw-line-creator-modal.component';
import {
  BasicLayerConfig,
  ILayeredMapWidgetConfig,
  isQueryLayerConfig,
  ITrack,
  LayerConfig,
} from './layered-map-widget.model';
import { LayerModalComponent } from './layer-config/layer-modal.component';
import { PopoverModalComponent } from './popover-config/popover-modal.component';
import { CenterMapModalComponent } from './center-map/center-map-modal.component';
import { LayerListComponent } from './layer-config/layer-list.component';

export type WidgetConfigMode = 'CREATE' | 'UPDATE';

@Component({
  templateUrl: './layered-map-widget-config.component.html',
  standalone: true,
  imports: [CoreModule, LayerListComponent],
})
export class LayeredMapWidgetConfig implements OnInit, DynamicComponent, OnBeforeSave {
  @Input() config: ILayeredMapWidgetConfig = {
    layers: [],
    manualCenter: { lat: 0, long: 0, zoomLevel: 15 },
  };

  readonly baseTileLayers = BASE_TILE_LAYERS;

  customTileLayers: CustomBaseTileLayerEntry[] = [];
  customLayersLoading = false;

  ng1FormRef?: Record<string, unknown>;
  items: IManagedObject[] = [];
  mode!: WidgetConfigMode;

  /** Resolves once we know whether the DTM microservice is installed. */
  private dtmInstalled = Promise.resolve(false);

  constructor(
    private bsModalService: BsModalService,
    private applicationAvailability: ApplicationAvailabilityService,
    private customBaseTileLayerService: CustomBaseTileLayerService
  ) {}

  ngOnInit(): void {
    this.mode = this.config.saved ? 'UPDATE' : 'CREATE';
    void this.loadCustomLayers();
    this.dtmInstalled = this.applicationAvailability.isAvailable(DTM_CONTEXT_PATH);

    if (!('layers' in this.config)) {
      (this.config as ILayeredMapWidgetConfig).layers = [];
    }

    if (!('baseTileLayerId' in this.config)) {
      this.config.baseTileLayerId = DEFAULT_BASE_TILE_LAYER_ID;
    }

    if (!('autoCenter' in this.config)) {
      this.config.autoCenter = true;
    } else {
      this.config.autoCenter = `${this.config.autoCenter}` === 'true';
    }

    if (!('manualCenter' in this.config)) {
      (this.config as ILayeredMapWidgetConfig).manualCenter = { lat: 0, long: 0, zoomLevel: 15 };
    }

    if (!('positionPolling' in this.config)) {
      // Disabled by default: only devices that actually move need position
      // polling. For stationary devices it just produces needless requests.
      this.config.positionPolling = {
        enabled: false,
        interval: 10,
      };
    } else {
      this.config.positionPolling.enabled = `${this.config.positionPolling.enabled}` === 'true';
    }

    this.config.layers.forEach((layer) => {
      layer.config.enablePolling = `${layer.config.enablePolling}` === 'true';
    });
  }

  async openLayerModal(layer?: LayerConfig<BasicLayerConfig>) {
    const dtmInstalled = await this.dtmInstalled;
    const modalRef = this.bsModalService.show(LayerModalComponent, {});

    if (modalRef.content) {
      modalRef.content.dtmInstalled = dtmInstalled;
    }

    const close = lastValueFrom(modalRef.content?.closeSubject.pipe(take(1)));

    if (!layer) {
      // create mode
      const created = await close;

      if (created) {
        this.config.layers?.push({ config: created, active: true });
        this.config.layers = [...this.config.layers];
      }
    } else {
      // edit mode
      const original = structuredClone(layer.config);

      modalRef.content?.setLayer(layer.config);
      const updated = await close;

      if (updated) {
        layer.config = updated;
        this.config.layers = [...this.config.layers];
      } else {
        layer.config = original;
      }
    }
  }

  async openPopoverModal(layer: LayerConfig<BasicLayerConfig>) {
    const modalRef = this.bsModalService.show(PopoverModalComponent);

    if (modalRef.content) {
      if (isQueryLayerConfig(layer.config)) {
        modalRef.content.assetType = layer.config.assetType;
      }

      modalRef.content.cfg.set(structuredClone(layer.config.popoverConfig));
    }

    const close = lastValueFrom(modalRef.content?.closeSubject.pipe(take(1)));
    const popoverConfig = await close;

    if (popoverConfig) {
      layer.config.popoverConfig = popoverConfig;
    }
  }

  async openCenterMapModal() {
    const modalRef = this.bsModalService.show(CenterMapModalComponent);

    if (this.config.manualCenter) {
      modalRef.content?.center.set(structuredClone(this.config.manualCenter));
    }
    const modal = lastValueFrom(modalRef.content?.closeSubject.pipe(take(1)));
    const center = await modal;

    if (center) {
      this.config.manualCenter = center;
    }
  }

  editLayer(layer: LayerConfig<BasicLayerConfig>) {
    void this.openLayerModal(layer);
  }

  editPopover(layer: LayerConfig<BasicLayerConfig>) {
    void this.openPopoverModal(layer);
  }

  deleteLayer(layer: LayerConfig<BasicLayerConfig>) {
    this.config.layers = this.config.layers.filter((l) => l !== layer);
  }

  async openEventTrackCreatorModal() {
    const modalRef = this.bsModalService.show(EventLineCreatorModalComponent, {});

    modalRef.content.items = [...(this.config.devices ?? [])]; // TODO: remove this and add device selection in event modal
    const openExportTemplateModal = lastValueFrom(modalRef.content?.closeSubject.pipe(take(1)));
    const track = await openExportTemplateModal;

    if (track) {
      this.addTrackToConfig(track);
    }
  }

  async openDrawTrackCreatorModal() {
    const modalRef = this.bsModalService.show(DrawLineCreatorModalComponent, {
      class: 'modal-lg',
    });
    const openExportTemplateModal = lastValueFrom(modalRef.content.closeSubject.pipe(take(1)));
    const track = await openExportTemplateModal;

    if (track) {
      this.addTrackToConfig(track);
    }
  }

  private addTrackToConfig(track: ITrack | null): void {
    if (!track) {
      return;
    }

    if (!this.config.tracks) {
      this.config.tracks = [];
    }
    this.config.tracks.push(track);
  }

  deleteTrack(track: ITrack): void {
    this.config.tracks = this.config.tracks?.filter((t) => t.name !== track.name);

    if (this.config.selectedTrack === track.name) {
      this.config.selectedTrack = undefined;
    }
  }

  userChangedSelection(event: { checked: boolean; track: ITrack }): void {
    const { checked, track } = event;

    if (checked) {
      // check and select a new element (automatically unchecks other ones)
      this.config.selectedTrack = track.name;
    } else if (track.name === this.config.selectedTrack) {
      this.config.selectedTrack = undefined;
    }
  }

  private async loadCustomLayers(): Promise<void> {
    this.customLayersLoading = true;
    this.customTileLayers = await this.customBaseTileLayerService.load();
    this.customLayersLoading = false;
  }

  async openCustomBaseLayerModal(existing?: CustomBaseTileLayerEntry): Promise<void> {
    const modalRef = this.bsModalService.show(CustomBaseLayerModalComponent);

    if (existing && modalRef.content) {
      modalRef.content.setEntry(existing);
    }

    const result = await lastValueFrom(modalRef.content?.closeSubject.pipe(take(1)));

    if (!result) {
      return;
    }

    const updated = existing
      ? this.customTileLayers.map((l) => (l.id === existing.id ? result : l))
      : [...this.customTileLayers, { ...result, id: crypto.randomUUID() }];

    await this.customBaseTileLayerService.save(updated);
    this.customTileLayers = updated;
  }

  async deleteCustomBaseLayer(entry: CustomBaseTileLayerEntry): Promise<void> {
    const updated = this.customTileLayers.filter((l) => l.id !== entry.id);

    if (this.config.baseTileLayerId === entry.id) {
      this.config.baseTileLayerId = DEFAULT_BASE_TILE_LAYER_ID;
    }

    await this.customBaseTileLayerService.save(updated);
    this.customTileLayers = updated;
  }

  onBeforeSave(config?: ILayeredMapWidgetConfig): Promise<boolean> {
    if (!config) {
      return Promise.resolve(false);
    }

    config.saved = true;

    return Promise.resolve(true);
  }
}
