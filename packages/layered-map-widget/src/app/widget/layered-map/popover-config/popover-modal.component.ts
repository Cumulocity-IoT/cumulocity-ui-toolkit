import { Component, effect, inject, model } from '@angular/core';
import { AlertService, CommonModule, CoreModule, ModalLabels } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { PopoverConfig } from '../layered-map-widget.model';
import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { DomainModelEditorComponent } from '~components/domain-object-editor/domain-model-editor.component';
import { DtmAssetProperty, DtmService } from '~services/dtm.service';
import { ModalTab } from '~models/modal-tab.model';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { TooltipModule } from 'ngx-bootstrap/tooltip';

type Tab = ModalTab<'operation' | 'alarm' | 'event'>;

@Component({
  templateUrl: './popover-modal.component.html',
  styleUrls: ['./popover-modal.component.less'],
  standalone: true,
  imports: [CoreModule, CommonModule, DomainModelEditorComponent, CollapseModule, TooltipModule],
})
export class PopoverModalComponent {
  title = 'Popover config';
  closeSubject: Subject<PopoverConfig | null> = new Subject();
  labels: ModalLabels = { ok: 'Save', cancel: 'Cancel' };
  json: Record<string, unknown>;

  cfg = model<PopoverConfig>();

  mode = 'operation';

  config: PopoverConfig = {
    showAlarms: true,
    showDate: true,
    showLatestValues: false,
    assetProperties: [],
    actions: [],
  };

  /** Asset type of the layer being configured (set by the config component). */
  private _assetType?: string;
  availableAssetProperties: DtmAssetProperty[] = [];
  newProperty = '';

  set assetType(value: string | undefined) {
    this._assetType = value;

    if (value) {
      void this.loadAssetProperties(value);
    }
  }

  get assetType(): string | undefined {
    return this._assetType;
  }

  /** Asset-property configuration is only available for asset layers. */
  get isAssetLayer(): boolean {
    return !!this._assetType;
  }

  tabs: Tab[] = [
    {
      id: 'alarm',
      label: gettext('Alarm'),
      icon: 'dlt-c8y-icon-bell',
    },
    {
      id: 'event',
      label: gettext('Event'),
      icon: 'c8y-icon c8y-icon-events',
    },
    {
      id: 'operation',
      label: gettext('Operation'),
      icon: 'c8y-icon c8y-icon-device-control',
      active: true,
    },
  ];

  currentTab: Tab['id'] = this.tabs.find((t) => t.active)?.id ?? this.tabs[2].id;

  form = new FormGroup({});
  fields: FormlyFieldConfig[] = [
    {
      key: 'showDate',
      templateOptions: {
        label: gettext('Show last update date'),
      },
      type: 'checkbox',
      defaultValue: true,
    },
    {
      key: 'showAlarms',
      templateOptions: {
        label: gettext('Show alarm icons'),
      },
      type: 'checkbox',
      defaultValue: true,
    },
    {
      key: 'showLatestValues',
      templateOptions: {
        label: gettext('Show latest measurement values'),
        description: gettext(
          'Displays the device’s latest measurement values. Requires the "latest value" feature to be enabled in the tenant.'
        ),
      },
      type: 'checkbox',
      defaultValue: false,
    },
  ];

  isActionsFormCollapsed = true;
  isEditorValid = false;

  private readonly alert = inject(AlertService);

  public bsModalRef = inject(BsModalRef);

  private dtm = inject(DtmService);

  constructor() {
    effect(() => {
      const value = this.cfg();

      if (value) {
        this.config = value;

        if (!this.config.assetProperties) {
          this.config.assetProperties = [];
        }

        const [dateField, iconField, latestValuesField] = this.fields;

        dateField.defaultValue = value.showDate;
        iconField.defaultValue = value.showAlarms;
        latestValuesField.defaultValue = value.showLatestValues ?? false;
      }
    });
  }

  private async loadAssetProperties(assetType: string): Promise<void> {
    try {
      this.availableAssetProperties = await this.dtm.getAssetTypeProperties(assetType);
    } catch (e) {
      this.availableAssetProperties = [];
      this.alert.danger(gettext('Could not load the asset type properties.'), e as string);
    }
  }

  addProperty(name: string): void {
    const key = name?.trim();

    if (!key) {
      return;
    }

    if (!this.config.assetProperties) {
      this.config.assetProperties = [];
    }

    if (!this.config.assetProperties.includes(key)) {
      this.config.assetProperties.push(key);
    }

    this.newProperty = '';
  }

  removeProperty(name: string): void {
    this.config.assetProperties = (this.config.assetProperties ?? []).filter((p) => p !== name);
  }

  changeTab(tabId: Tab['id']): void {
    this.tabs.map((t) => {
      t.active = t.id === tabId;
    });
    this.currentTab = tabId;
  }

  onChange(text: string): void {
    this.json = JSON.parse(text) as Record<string, unknown>;
  }

  scroll(element: HTMLElement): void {
    element.scrollIntoView();
  }

  addAction(currentTab: Tab['id']) {
    this.config.actions.push({
      label: `Create ${currentTab}`,
      body: this.json,
      type: currentTab,
    });
    this.isActionsFormCollapsed = true;
  }

  removeAction(action: object): void {
    this.config.actions = this.config.actions.filter((a) => a !== action);
  }

  cancelAdd(): void {
    // TODO: reset the form
    this.isActionsFormCollapsed = true;
  }

  // - MODAL section

  // called if cancel is pressed
  onDismiss(): void {
    this.closeSubject.next(null);
  }

  // called if save is pressed
  onClose(): void {
    this.closeSubject.next(this.config);
  }
}
