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
  CUSTOM_FIELD_KEY_PREFIX,
  DETAIL_FIELD_CATALOGUE,
  branchFieldCatalogue,
  customFieldKey,
  detailFieldFor,
  resolveDetailFieldKeys,
} from './asset-detail-fields';
import { AssetTreeService } from './asset-tree.service';

/** How many assets of the type the field picker reads the available fragments off. */
const PICKER_SAMPLE_SIZE = 10;

/**
 * Cascade level 3 — the ⚙ panel (§6.3): which fields the detail panel shows for **the
 * hovered asset's type**, in which order, plus the sparkline toggle.
 *
 * Per type, not globally: a park and a turbine share no useful field beyond their name, so
 * one list meant every choice made for one was wrong for the other. The panel therefore
 * configures `wind_turbine` when opened from a turbine and `wind_park` when opened from a
 * park, and says so in its header.
 *
 * The vocabulary is `DETAIL_FIELD_CATALOGUE` (NFR-T6) **plus** anything the user picks with
 * the shared inventory-field picker — the same modal the overview's config drawer uses for
 * its table columns and popup sections. Picked fields are `mo:<path>` keys resolved from
 * the asset store's tier-0 properties, so they cost no request; branches are offered only
 * `mo` fields, because a group has no measurement series of its own.
 *
 * Unlike `OverviewConfigDrawerComponent`, edits apply immediately rather than on Save:
 * this is a per-user view preference on an already-open panel, and a Save/Cancel pair
 * inside a hover cascade would mean the panel has to stay open across a pointer trip to
 * a footer button. Persistence is per user (`UserPreferencesService`), so the choice
 * survives a reload (AC-T6).
 */
@Component({
  selector: 'ps-detail-field-config',
  templateUrl: './detail-field-config.component.html',
  styleUrls: ['./detail-field-config.component.less'],
  imports: [CoreModule, CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DetailFieldConfigComponent {
  /** The asset the detail panel is showing — this panel configures **its type**. */
  readonly assetId = input.required<string>();

  readonly closed = output<void>();
  /**
   * `true` while a modal opened from here is up.
   *
   * The container has to hold the cascade open for that whole time: the modal is outside
   * the panel, so the pointer leaving for it would otherwise start the close grace period
   * and destroy this component — and with it the promise waiting for the picked fields.
   */
  readonly modalOpen = output<boolean>();

  private readonly tree = inject(AssetTreeService);
  private readonly assets = inject(AssetStoreService);
  private readonly bsModal = inject(BsModalService);

  protected readonly sparkline = this.tree.sparkline;

  private readonly node = computed(() => this.assets.node(this.assetId()));
  /** The type being configured. Empty only if the asset left the store mid-hover. */
  protected readonly assetType = computed(() => this.node()?.type ?? '');
  protected readonly typeLabel = computed(() =>
    this.assetType() ? humanizeInventoryKey(this.assetType()) : ''
  );

  /**
   * A group rather than a turbine. Same test as the detail panel's, so the two can never
   * disagree about which vocabulary applies.
   */
  protected readonly isBranch = computed(
    () => !!this.assetType() && this.assetType() !== this.assets.config().leafType
  );

  private readonly keys = computed(() =>
    resolveDetailFieldKeys(this.tree.configuredFieldKeys(this.assetType()), this.isBranch())
  );

  /** Selected fields, in their configured order. */
  protected readonly selected = computed(() =>
    this.keys()
      .map((key) => detailFieldFor(key))
      .filter((field): field is NonNullable<typeof field> => field !== undefined)
  );

  protected readonly available = computed(() => {
    const chosen = new Set(this.keys());
    const catalogue = this.isBranch() ? branchFieldCatalogue() : DETAIL_FIELD_CATALOGUE;
    return catalogue.filter((field) => !chosen.has(field.spec.key));
  });

  /**
   * The last remaining field of a **leaf** type cannot be unchecked.
   *
   * An empty selection is how `resolveDetailFieldKeys` spells "never configured" for a leaf —
   * an empty turbine panel is not a valid state — so unchecking the last box would have
   * brought the whole default set back instead of leaving one field, which reads as the panel
   * ignoring the click. A branch has no such floor: its identity is the rollup rows the panel
   * always renders, so emptying its additions is a legitimate choice.
   */
  protected readonly atMinimum = computed(() => !this.isBranch() && this.keys().length === 1);

  protected isCustom(key: string): boolean {
    return key.startsWith(CUSTOM_FIELD_KEY_PREFIX);
  }

  /** The MO path behind a picked field, for its `title` — the label drops the prefix. */
  protected pathOf(key: string): string {
    return key.slice(CUSTOM_FIELD_KEY_PREFIX.length);
  }

  protected async toggleField(key: string): Promise<void> {
    const keys = this.keys();
    const removing = keys.includes(key);

    // Also guarded here, not just by the disabled checkbox: the floor is a rule about the
    // stored value, and a caller reaching this any other way must not be able to cross it.
    if (removing && this.atMinimum()) return;
    await this.write(removing ? keys.filter((item) => item !== key) : [...keys, key]);
  }

  protected async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const keys = [...this.keys()];

    moveItemInArray(keys, event.previousIndex, event.currentIndex);
    await this.write(keys);
  }

  /**
   * Adds inventory fields picked from the assets of this type. The sample comes from the
   * asset store, so the picker offers exactly the fragments the panel can then actually
   * read — and opening it costs no request.
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
      const keys = this.keys();
      const additions = picked
        .map((field: { path: string }) => customFieldKey(field.path))
        .filter((key: string) => !keys.includes(key));

      if (additions.length) await this.write([...keys, ...additions]);
    } finally {
      this.modalOpen.emit(false);
    }
  }

  /** Drives the "Add asset properties" button's disabled state — see {@link samples}. */
  protected readonly hasSamples = computed(() => this.samples().length > 0);

  protected async toggleSparkline(): Promise<void> {
    await this.tree.setSparkline(!this.tree.sparkline());
  }

  /** Back to the default set for this type — other types keep their configuration. */
  protected async reset(): Promise<void> {
    if (!this.assetType()) return;
    await this.tree.resetDetailFields(this.assetType());
  }

  private async write(keys: readonly string[]): Promise<void> {
    if (!this.assetType()) return;
    await this.tree.setDetailFieldKeys(this.assetType(), keys);
  }

  /**
   * Up to {@link PICKER_SAMPLE_SIZE} assets of this type, for the picker to read the
   * available fragments off.
   *
   * A `computed` rather than a method: the template asks for it (through
   * {@link hasSamples}) on every change-detection pass, and a type with few instances walks
   * the whole cached fleet before it finds its ten — thousands of map entries per pass, for
   * a button's disabled state. Memoised, it runs once per (asset, fleet).
   */
  private readonly samples = computed<Readonly<Record<string, unknown>>[]>(() => {
    const type = this.assetType();

    if (!type) return [];
    const samples: Readonly<Record<string, unknown>>[] = [];
    // The hovered asset first: it is the one the user is looking at, so a fragment only
    // it carries has to be offered rather than sampled away.
    const hovered = this.node();

    if (hovered) samples.push(hovered.properties);

    for (const node of this.assets.hierarchy()?.byId.values() ?? []) {
      if (samples.length >= PICKER_SAMPLE_SIZE) break;
      if (node.type === type && node.id !== hovered?.id) samples.push(node.properties);
    }

    return samples;
  });
}
