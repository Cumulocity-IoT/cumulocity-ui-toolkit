import { Component } from '@angular/core';
import { CoreModule, ModalLabels } from '@c8y/ngx-components';
import { IconSelectorService } from '@c8y/ngx-components/icon-selector';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { QueryFormsTabComponent } from '~components/_formly-fields/query-forms/query-forms-tab.component';
import { DtmAssetType, DtmService } from '~services/dtm.service';
import {
  BasicLayerConfig,
  isQueryLayerConfig,
  QueryLayerConfig,
} from '../layered-map-widget.model';

@Component({
  templateUrl: './layer-modal.component.html',
  standalone: true,
  imports: [CoreModule, QueryFormsTabComponent],
})
export class LayerModalComponent {
  title = 'Create layer';
  closeSubject: Subject<QueryLayerConfig | undefined> = new Subject();

  labels: ModalLabels = { ok: 'Create', cancel: 'Cancel' };
  layer: Partial<QueryLayerConfig> = {
    name: '',
    color: '',
    icon: '',
    enablePolling: true,
    pollingInterval: 60,
  };

  type: 'QueryLayerConfig' | 'Unset' = 'Unset';
  queryType: 'Alarm' | 'Inventory' | 'Event' = 'Inventory';

  /** Set by the config component; gates the "Assets" layer type. */
  dtmInstalled = false;
  isAssetLayer = false;
  selectedAssetType?: string;
  assetTypes: DtmAssetType[] = [];
  loadingAssetTypes = false;
  /** Toggled to force a re-mount of the query form when the asset type changes. */
  queryFormVisible = true;

  constructor(
    public bsModalRef: BsModalRef,
    private iconSelector: IconSelectorService,
    private dtm: DtmService
  ) {}

  setLayer(layer: BasicLayerConfig) {
    this.layer = layer;
    this.title = 'Edit layer';
    this.labels = { ok: 'Update', cancel: 'Cancel' };

    if (isQueryLayerConfig(layer)) {
      this.type = 'QueryLayerConfig';
      this.queryType = layer.type;

      if (layer.assetType) {
        this.isAssetLayer = true;
        this.selectedAssetType = layer.assetType;
        void this.loadAssetTypes();
      }
    }
  }

  /** OK button enablement; an asset layer additionally requires a chosen type. */
  get canSave(): boolean {
    return (
      this.type !== 'Unset' && !!this.layer.name && (!this.isAssetLayer || !!this.selectedAssetType)
    );
  }

  private async loadAssetTypes(): Promise<void> {
    if (this.assetTypes.length || this.loadingAssetTypes) {
      return;
    }

    this.loadingAssetTypes = true;

    try {
      this.assetTypes = await this.dtm.getAssetTypes();
    } catch (e) {
      console.warn('Failed to load DTM asset types', e);
      this.assetTypes = [];
    } finally {
      this.loadingAssetTypes = false;
    }
  }

  onAssetTypeSelect(identifier: string): void {
    this.selectedAssetType = identifier;
    const assetType = this.assetTypes.find((t) => t.identifier === identifier);
    const { color, pollingInterval, enablePolling } = this.layer;

    // Prefill a regular inventory query with the asset type. Reusing the query
    // form lets users add further customizations on top.
    this.layer = {
      name: assetType?.label ?? this.layer.name,
      color,
      icon: assetType?.icon?.name ?? this.layer.icon,
      pollingInterval,
      enablePolling,
      assetType: identifier,
      ...{ type: 'Inventory', filter: { type: identifier } },
    };
    this.queryType = 'Inventory';

    // Re-mount the query form so it picks up the prefilled filter.
    this.queryFormVisible = false;
    setTimeout(() => (this.queryFormVisible = true));
  }

  async openIconModal() {
    const icon = await this.iconSelector.selectIcon({ currentSelection: this.layer.icon });

    if (icon) {
      this.layer.icon = icon;
    }
  }

  changeType(type: string) {
    const { name, color, icon, pollingInterval, enablePolling } = this.layer;

    if (type === 'Assets') {
      this.isAssetLayer = true;
      this.selectedAssetType = undefined;
      this.layer = {
        name,
        color,
        icon,
        pollingInterval,
        enablePolling,
        ...{ type: 'Inventory', filter: {} },
      };
      this.type = 'QueryLayerConfig';
      this.queryType = 'Inventory';
      void this.loadAssetTypes();
    } else if (type === 'QueryLayerConfig') {
      this.isAssetLayer = false;
      this.selectedAssetType = undefined;
      this.layer = {
        name,
        color,
        icon,
        pollingInterval,
        enablePolling,
        ...{ type: 'Inventory', filter: {} },
      };
      this.type = 'QueryLayerConfig';
      this.queryType = 'Inventory';
    }
  }

  onQueryTypeChange(type: 'Alarm' | 'Inventory' | 'Event') {
    // Asset layers are always Inventory; the other tabs are disabled so this
    // handler is never reached for them — but guard defensively.
    if (this.isAssetLayer) {
      return;
    }
    const { name, color, icon, pollingInterval, enablePolling } = this.layer;

    if (type === 'Alarm') {
      this.layer = {
        name,
        color,
        icon,
        pollingInterval,
        enablePolling,
        ...{ type: 'Alarm', filter: {} },
      };
      this.type = 'QueryLayerConfig';
      this.queryType = 'Alarm';
    } else if (type === 'Event') {
      this.layer = {
        name,
        color,
        icon,
        pollingInterval,
        enablePolling,
        ...{ type: 'Event', filter: {} },
      };
      this.type = 'QueryLayerConfig';
      this.queryType = 'Event';
    } else if (type === 'Inventory') {
      this.layer = {
        name,
        color,
        icon,
        pollingInterval,
        enablePolling,
        ...{ type: 'Inventory', filter: {} },
      };
      this.type = 'QueryLayerConfig';
      this.queryType = 'Inventory';
    }
  }

  // - MODAL section

  // called if cancel is pressed
  onDismiss(): void {
    this.closeSubject.next(undefined);
  }

  // called if save is pressed
  onClose(): void {
    this.closeSubject.next(this.layer as QueryLayerConfig);
  }
}
