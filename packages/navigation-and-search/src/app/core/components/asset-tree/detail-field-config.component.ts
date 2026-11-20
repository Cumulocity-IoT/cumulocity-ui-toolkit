import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { InventoryService } from '@c8y/client';
import { BottomDrawerService, CoreModule } from '@c8y/ngx-components';
import { AssetPropertiesService } from '@c8y/ngx-components/asset-properties';
import { AssetPropertyPickerDrawerComponent } from './asset-property-picker-drawer.component';
import { humanizeInventoryKey } from '../inventory-field-picker/inventory-field.model';
import type { AssetNode } from '../../services/asset-store/asset-store.model';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import {
  detailFieldId,
  fieldsForType,
  type DetailField,
} from '../../services/settings/detail-panel.model';
import { NavigatorSettingsService } from '../../services/settings/navigator-settings.service';
import {
  DETAIL_FIELD_CATALOGUE,
  assetPropertyField,
  branchFieldCatalogue,
} from './asset-detail-fields';

/** How many cached assets of the type are compared to pick the property selector's asset. */
const CONTEXT_CANDIDATES = 10;

/**
 * The detail-field editor: which fields the detail panel shows for **one asset type** (or for
 * the `default` list), in which order. It edits the detail-panel data contract stored in the
 * navigator settings (`NavigatorSettings.detailPanel`, see `detail-panel.model.ts`).
 *
 * Hosted by the settings drawer's "Detail fields by level" tab, for the hierarchy level (or
 * the default list) picked there.
 *
 * A type without its own entry shows what it currently gets (the default list for a leaf,
 * nothing for a branch); the first edit creates the type's entry from that, and "Reset to
 * default" removes the entry again. Edits apply at once, like every other setting.
 *
 * The vocabulary is the built-in fields (`DETAIL_FIELD_CATALOGUE`) **plus** any property picked
 * in the platform's asset property list (`AssetPropertyPickerDrawerComponent`, stacked on the
 * settings drawer); branches are not offered availability and alarms, which their subtree
 * rows always show.
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

  private readonly settings = inject(NavigatorSettingsService);
  private readonly assets = inject(AssetStoreService);
  private readonly bottomDrawers = inject(BottomDrawerService);
  private readonly inventory = inject(InventoryService);
  private readonly assetProperties = inject(AssetPropertiesService);

  protected readonly typeLabel = computed(() => {
    const type = this.assetType();

    return type ? humanizeInventoryKey(type) : '';
  });

  /**
   * Whether the type is a group: any cached asset of the type has children, loaded or
   * pending (the detail panel's test, per asset).
   */
  protected readonly isBranch = computed(() => {
    const type = this.assetType();
    const hierarchy = this.assets.hierarchy();

    if (type === null || !hierarchy) return false;

    for (const candidate of hierarchy.byId.values()) {
      if (
        candidate.type === type &&
        (candidate.childIds.length || hierarchy.pendingChildren.has(candidate.id))
      ) {
        return true;
      }
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

  /**
   * The asset the property selector lists the properties of: of this type (any type, for the
   * default list), the one carrying the most fragments among the first few cached — so a
   * sparsely filled asset does not hide what its siblings carry. `null` disables "Add asset
   * properties".
   */
  protected readonly contextAssetId = computed<string | null>(() => {
    const type = this.assetType();
    let best: AssetNode | null = null;
    let seen = 0;

    for (const node of this.assets.hierarchy()?.byId.values() ?? []) {
      if (type !== null && node.type !== type) continue;

      if (!best || Object.keys(node.properties).length > Object.keys(best.properties).length) {
        best = node;
      }
      if (++seen >= CONTEXT_CANDIDATES) break;
    }

    return best?.id ?? null;
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
   * Adds the properties picked in the platform's asset property list, opened as a second bottom
   * drawer on the settings drawer for {@link contextAssetId}. Computed properties are not
   * offered: the panel reads stored fragments only (see `assetPropertyField`).
   *
   * The list gets the full managed object (one request): it picks what to list by the
   * `c8y_IsDevice` / `c8y_IsDeviceGroup` / `c8y_IsAsset` markers, which the store's cached
   * projection does not keep. For an asset (`c8y_IsAsset`) it lists the **modelled** properties
   * only (DTM definition or asset library) — none on a tenant without DTM — so the asset's own
   * fragments it does not already list are merged in as extra properties.
   */
  protected async addAssetProperties(): Promise<void> {
    const id = this.contextAssetId();

    if (!id) return;
    const { data: asset } = await this.inventory.detail(id);
    const [listed, fragments] = await Promise.all([
      this.assetProperties.getInitialProperties(asset),
      this.assetProperties.getGroupProperties(asset),
    ]);
    const ownFragments = fragments.filter(
      (fragment) =>
        !listed.some((property) => this.assetProperties.isSameProperty(property, fragment))
    );
    // Flattened as the list does with what it discovers itself, so a fragment like
    // `c8y_Hardware` offers its leaves (`serialNumber`) — extra properties are taken as given.
    const { computed, simple, complex } =
      this.assetProperties.categorizeAndFlattenHierarchicalProperties(ownFragments);
    const extraProperties = [...computed, ...simple, ...complex];
    const drawer = this.bottomDrawers.openDrawer(AssetPropertyPickerDrawerComponent, {
      disableClickOutside: true,
      initialState: { asset, extraProperties, subtitle: this.typeLabel() },
    });
    const picked = await drawer.instance.result.catch((): null => null);

    if (!picked?.length) return;
    const fields = this.selected();
    const ids = new Set(fields.map(detailFieldId));
    const additions: DetailField[] = [];

    for (const property of picked) {
      const field = assetPropertyField(property);

      if (field && !ids.has(detailFieldId(field))) {
        ids.add(detailFieldId(field));
        additions.push(field);
      }
    }

    if (additions.length) await this.write([...fields, ...additions]);
  }

  /** Back to the default: this type falls back again, or `default` gets the built-in list. */
  protected async reset(): Promise<void> {
    await this.settings.resetDetailFields(this.assetType());
  }

  private async write(fields: readonly DetailField[]): Promise<void> {
    await this.settings.setDetailFields(this.assetType(), fields);
  }
}
