import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { humanizeInventoryKey } from '../core/components/inventory-field-picker/inventory-field.model';
import { DetailFieldConfigComponent } from '../core/components/asset-tree/detail-field-config.component';
import { AssetStoreService } from '../core/services/asset-store/asset-store.service';
import { NavigatorSettingsService } from '../core/services/settings/navigator-settings.service';

/** `<select>` value standing for the `default` list (a type can never be empty). */
const DEFAULT_OPTION = '';

/**
 * "Detail fields…" from the options menu: the same editor the detail panel's ⚙ opens, for a
 * type picked here — any type present in the tree, any type that already has its own list, or
 * the default list. Opened with `BsModalService.show(...)`.
 */
@Component({
  selector: 'ps-detail-fields-modal',
  standalone: true,
  imports: [CoreModule, DetailFieldConfigComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="modal-header dialog-header">
      <i c8yIcon="list"></i>
      <h4 id="modal-title">{{ 'Detail fields' | translate }}</h4>
    </div>
    <div class="modal-body" data-cy="asset-navigator--detail-fields-modal">
      <div class="form-group">
        <label for="psDetailFieldsType">{{ 'Asset type' | translate }}</label>
        <div class="c8y-select-wrapper">
          <select
            class="form-control"
            id="psDetailFieldsType"
            [value]="selected()"
            (change)="selected.set($any($event.target).value)"
            data-cy="asset-navigator--detail-fields-type"
          >
            <option [value]="defaultOption">{{ 'Default (all other types)' | translate }}</option>
            @for (type of types(); track type.value) {
              <option [value]="type.value">
                {{ type.label }} ({{ type.value }}){{ type.own ? ' ✓' : '' }}
              </option>
            }
          </select>
        </div>
      </div>
      <ps-detail-field-config [assetType]="assetType()" [closable]="false" />
    </div>
    <div class="modal-footer">
      <button
        class="btn btn-primary"
        (click)="modal.hide()"
        type="button"
        data-cy="asset-navigator--detail-fields-done"
      >
        {{ 'Done' | translate }}
      </button>
    </div>
  `,
})
export class DetailFieldsModalComponent {
  protected readonly modal = inject(BsModalRef);
  private readonly assets = inject(AssetStoreService);
  private readonly settings = inject(NavigatorSettingsService);

  protected readonly defaultOption = DEFAULT_OPTION;
  protected readonly selected = signal(DEFAULT_OPTION);
  protected readonly assetType = computed(() => this.selected() || null);

  /** Types in the tree plus types with a stored list, sorted by label. ✓ marks the latter. */
  protected readonly types = computed(() => {
    const configured = this.settings.settings().detailPanel.types;
    const values = new Set(Object.keys(configured));

    for (const node of this.assets.hierarchy()?.byId.values() ?? []) {
      if (node.type) values.add(node.type);
    }

    return [...values]
      .map((value) => ({ value, label: humanizeInventoryKey(value), own: value in configured }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });
}
