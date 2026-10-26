import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { CoreModule } from '@c8y/ngx-components';
import { BsModalService } from 'ngx-bootstrap/modal';
import { InventoryFieldPickerComponent } from '../inventory-field-picker/inventory-field-picker.component';
import { humanizeInventoryKey } from '../inventory-field-picker/inventory-field.model';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import {
  detailFieldId,
  fieldsForType,
  type DetailField,
} from '../../services/settings/detail-panel.model';
import { NavigatorSettingsService } from '../../services/settings/navigator-settings.service';
import { DETAIL_FIELD_CATALOGUE, branchFieldCatalogue, propertyField } from './asset-detail-fields';

/** How many assets of the type the field picker reads the available fragments off. */
const PICKER_SAMPLE_SIZE = 10;

/**
 * The detail-field editor: which fields the detail panel shows for **one asset type** (or for
 * the `default` list), in which order. It edits the detail-panel data contract stored in the
 * navigator settings (`NavigatorSettings.detailPanel`, see `detail-panel.model.ts`).
 *
 * Opened two ways: as cascade level 3 from the detail panel's ⚙ (for the hovered asset's
 * type), and from the options menu's "Detail fields…" (for a type picked there).
 *
 * A type without its own entry shows what it currently gets (the default list for a leaf,
 * nothing for a branch); the first edit creates the type's entry from that, and "Reset to
 * default" removes the entry again. Edits apply at once — there is no Save step inside a hover
 * cascade.
 *
 * The vocabulary is the built-in fields (`DETAIL_FIELD_CATALOGUE`) **plus** any inventory
 * property picked with the shared inventory-field picker; branches are not offered
 * availability and alarms, which their subtree rows always show.
 */
@Component({
  selector: 'ps-detail-field-config',
  templateUrl: './detail-field-config.component.html',
  styleUrls: ['./detail-field-config.component.less'],
  imports: [CoreModule, CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailFieldConfigComponent {
  /** The type to configure; `null` configures the `default` list. */
  readonly assetType = input<string | null>(null);
  /** The asset the panel was opened from, if any — sampled first by the property picker. */
  readonly assetId = input<string | null>(null);
  /** Hides the close button where the host has its own (the options-menu modal). */
  readonly closable = input(true);

  readonly closed = output<void>();
  /**
   * `true` while a modal opened from here is up.
   *
   * The cascade has to stay open for that whole time: the modal is outside the panel, so the
   * pointer leaving for it would otherwise start the close grace period and destroy this
   * component — and with it the promise waiting for the picked fields.
   */
  readonly modalOpen = output<boolean>();

  private readonly settings = inject(NavigatorSettingsService);
  private readonly assets = inject(AssetStoreService);
  private readonly bsModal = inject(BsModalService);

  private readonly node = computed(() => {
    const id = this.assetId();

    return id ? this.assets.node(id) : undefined;
  });

  protected readonly typeLabel = computed(() => {
    const type = this.assetType();

    return type ? humanizeInventoryKey(type) : '';
  });

  /**
   * Whether the type is a group. From the hovered asset when there is one (same test as the
   * detail panel), else from any cached asset of the type having children.
   */
  protected readonly isBranch = computed(() => {
    const type = this.assetType();

    if (type === null) return false;
    const node = this.node();

    if (node) return node.childIds.length > 0;

    for (const candidate of this.assets.hierarchy()?.byId.values() ?? []) {
      if (candidate.type === type && candidate.childIds.length) return true;
    }

    return false;
  });

  /** The type has its own list (as opposed to falling back). Always true for `default`. */
  protected readonly hasOwnEntry = computed(() => {
    const type = this.assetType();

    return type === null || type in this.settings.settings().detailPanel.types;
  });

  /** Selected fields, in their configured order. */
  protected readonly selected = computed<readonly DetailField[]>(() => {
    const type = this.assetType();
    const config = this.settings.settings().detailPanel;

    return type === null ? config.default : fieldsForType(config, type, this.isBranch());
  });

  protected readonly available = computed(() => {
    const chosen = new Set(this.selected().map(detailFieldId));
    const catalogue = this.isBranch() ? branchFieldCatalogue() : DETAIL_FIELD_CATALOGUE;

    return catalogue.filter((field) => !chosen.has(detailFieldId(field)));
  });

  protected readonly fieldId = detailFieldId;

  /** A picked inventory property rather than a built-in field — shows the path it reads. */
  protected pathOf(field: DetailField): string | null {
    return field.source.kind === 'property' &&
      !DETAIL_FIELD_CATALOGUE.some((builtin) => detailFieldId(builtin) === detailFieldId(field))
      ? field.source.path
      : null;
  }

  protected async toggleField(field: DetailField): Promise<void> {
    const id = detailFieldId(field);
    const fields = this.selected();
    const present = fields.some((item) => detailFieldId(item) === id);

    await this.write(
      present ? fields.filter((item) => detailFieldId(item) !== id) : [...fields, field]
    );
  }

  protected async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const fields = [...this.selected()];

    moveItemInArray(fields, event.previousIndex, event.currentIndex);
    await this.write(fields);
  }

  /**
   * Adds inventory properties picked from cached assets of this type (any asset, for the
   * default list). The sample comes from the asset store, so the picker offers exactly the
   * fragments the panel can then actually read — and opening it costs no request.
   */
  protected async addInventoryFields(): Promise<void> {
    const samples = this.samples();

    if (!samples.length) return;
    this.modalOpen.emit(true);

    try {
      const modalRef = this.bsModal.show(InventoryFieldPickerComponent, {
        class: 'modal-lg',
        initialState: { sampleRows: samples, dtmFields: [], subtitle: this.typeLabel() },
      });
      const picked = await (modalRef.content as InventoryFieldPickerComponent).result.catch(
        (): null => null
      );

      if (!picked?.length) return;
      const fields = this.selected();
      const ids = new Set(fields.map(detailFieldId));
      const additions = picked
        .map((field: { path: string }) => propertyField(field.path))
        .filter((field: DetailField) => !ids.has(detailFieldId(field)));

      if (additions.length) await this.write([...fields, ...additions]);
    } finally {
      this.modalOpen.emit(false);
    }
  }

  /** Drives the "Add asset properties" button's disabled state — see {@link samples}. */
  protected readonly hasSamples = computed(() => this.samples().length > 0);

  /** Back to the default: this type falls back again, or `default` gets the built-in list. */
  protected async reset(): Promise<void> {
    await this.settings.resetDetailFields(this.assetType());
  }

  private async write(fields: readonly DetailField[]): Promise<void> {
    await this.settings.setDetailFields(this.assetType(), fields);
  }

  /**
   * Up to {@link PICKER_SAMPLE_SIZE} assets of this type (or of any type, for the default
   * list), for the picker to read the available fragments off. Memoised: the template asks for
   * it on every change-detection pass, through {@link hasSamples}.
   */
  private readonly samples = computed<Readonly<Record<string, unknown>>[]>(() => {
    const type = this.assetType();
    const samples: Readonly<Record<string, unknown>>[] = [];
    // The hovered asset first: it is the one the user is looking at, so a fragment only
    // it carries has to be offered rather than sampled away.
    const hovered = this.node();

    if (hovered) samples.push(hovered.properties);

    for (const node of this.assets.hierarchy()?.byId.values() ?? []) {
      if (samples.length >= PICKER_SAMPLE_SIZE) break;

      if ((type === null || node.type === type) && node.id !== hovered?.id) {
        samples.push(node.properties);
      }
    }

    return samples;
  });
}
