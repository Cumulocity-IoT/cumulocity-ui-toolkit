import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import {
  CdkDrag,
  CdkDragHandle,
  CdkDropList,
  moveItemInArray,
  type CdkDragDrop,
} from '@angular/cdk/drag-drop';
import { CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import {
  ALARM_SEVERITIES,
  type AlarmSeverityKey,
} from '../../services/asset-store/asset-store.model';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import { NavigatorSettingsService } from '../../services/settings/navigator-settings.service';
import {
  ROLLUP_FNS,
  ROLLUP_FN_LABELS,
  needsLatestValues,
  rollupFieldId,
  rollupsForType,
  type RollupField,
  type RollupFn,
  type RollupMetric,
  type RollupSet,
} from '../../services/settings/rollup.model';
import {
  deviceTypes,
  measurementSeries,
  propertyOptions,
} from '../../services/settings/settings-catalog';
import { humanizeInventoryKey } from '../inventory-field-picker/inventory-field.model';
import { RollupService, formatRollup } from './rollup.service';

/** What the "Add rollup" form offers, in order. */
type MetricChoice =
  | 'count-assets'
  | 'count-devices'
  | 'available'
  | 'unavailable'
  | 'alarms'
  | 'alarmed-assets'
  | 'alarmed-devices'
  | 'property'
  | 'measurement';

const CHOICES: { value: MetricChoice; label: string }[] = [
  { value: 'count-assets', label: gettext('Assets below') },
  { value: 'count-devices', label: gettext('Devices') },
  { value: 'available', label: gettext('Available devices') },
  { value: 'unavailable', label: gettext('Unavailable devices') },
  { value: 'alarms', label: gettext('Active alarms') },
  { value: 'alarmed-assets', label: gettext('Assets with alarms') },
  { value: 'alarmed-devices', label: gettext('Devices with alarms') },
  { value: 'property', label: gettext('Asset property (number)') },
  { value: 'measurement', label: gettext('Latest measurement') },
];

/**
 * The rollups of one branch type (or of the `default` set): what its detail panel opens with and
 * which one is the row badge. Edits the rollup contract in the navigator settings
 * (`NavigatorSettings.rollups`, see `rollup.model.ts`) and apply at once, like the field editor
 * next to it. The first edit of a type without its own set copies the default.
 */
@Component({
  selector: 'ps-rollup-config',
  templateUrl: './rollup-config.component.html',
  styleUrl: './rollup-config.component.less',
  imports: [CoreModule, CdkDropList, CdkDrag, CdkDragHandle],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class RollupConfigComponent {
  /** The branch type to configure; `null` configures the default set. */
  readonly assetType = input<string | null>(null);
  /** An asset of the type whose values the rows show next to their labels. */
  readonly sampleId = input<string | null>(null);

  private readonly settings = inject(NavigatorSettingsService);
  private readonly assets = inject(AssetStoreService);
  protected readonly rollups = inject(RollupService);

  protected readonly choices = CHOICES;
  protected readonly severities = ALARM_SEVERITIES;
  protected readonly fns = ROLLUP_FNS;
  protected readonly fnLabels = ROLLUP_FN_LABELS;
  protected readonly fieldId = rollupFieldId;

  protected readonly set = computed<RollupSet>(() =>
    rollupsForType(this.settings.settings().rollups, this.assetType())
  );

  protected readonly hasOwnEntry = computed(() => {
    const type = this.assetType();

    return type === null || type in this.settings.settings().rollups.types;
  });

  // ── the "Add rollup" form ────────────────────────────────────────────────────────────────

  protected readonly adding = signal(false);
  protected readonly choice = signal<MetricChoice>('count-assets');
  protected readonly ofType = signal('');
  protected readonly picked = signal<AlarmSeverityKey[]>(['critical', 'major']);
  protected readonly path = signal('');
  protected readonly series = signal('');
  protected readonly fn = signal<RollupFn>('sum');
  protected readonly label = signal('');
  protected readonly unit = signal('');

  /** Asset types below this level, for "of type" — any type in the tree. */
  protected readonly assetTypes = computed(() => {
    const types = new Set<string>();

    for (const node of this.assets.hierarchy()?.byId.values() ?? [])
      if (node.type) types.add(node.type);

    return [...types].sort();
  });

  protected readonly deviceTypes = computed(() => deviceTypes(this.assets.hierarchy()));
  /** Numeric properties of the assets in the tree (of `ofType` when one is picked). */
  protected readonly numericPaths = computed(() =>
    propertyOptions(this.assets.hierarchy(), this.ofType() || null).filter(
      (option) => option.numeric
    )
  );

  protected readonly seriesOptions = computed(() => measurementSeries(this.assets.hierarchy()));
  protected readonly typeLabel = humanizeInventoryKey;

  /** The metric the form describes, or `null` while it is incomplete. */
  protected readonly draft = computed<RollupMetric | null>(() => {
    const type = this.ofType() || undefined;
    const severities = this.picked();

    switch (this.choice()) {
      case 'count-assets':
        return { kind: 'count', of: 'assets', ...(type ? { type } : {}) };
      case 'count-devices':
        return { kind: 'count', of: 'devices', ...(type ? { type } : {}) };
      case 'available':
        return { kind: 'availability', state: 'available' };
      case 'unavailable':
        return { kind: 'availability', state: 'unavailable' };
      case 'alarms':
        return severities.length ? { kind: 'alarms', severities } : null;
      case 'alarmed-assets':
        return severities.length ? { kind: 'alarmed', of: 'assets', severities } : null;
      case 'alarmed-devices':
        return severities.length ? { kind: 'alarmed', of: 'devices', severities } : null;
      case 'property':
        return this.path()
          ? { kind: 'property', path: this.path(), fn: this.fn(), ...(type ? { type } : {}) }
          : null;
      case 'measurement':
        return /^[^.\s]+\.[^.\s]+$/.test(this.series())
          ? { kind: 'measurement', series: this.series(), fn: this.fn() }
          : null;
    }
  });

  protected readonly draftLabel = computed(() => {
    const metric = this.draft();

    return metric ? this.rollups.labelOf({ label: '', metric }) : '';
  });

  protected readonly duplicate = computed(() => {
    const metric = this.draft();

    return (
      !!metric &&
      this.set().fields.some((field) => rollupFieldId(field) === rollupFieldId({ metric }))
    );
  });

  /** The sample's value per field, for the list. */
  protected valueOf(field: RollupField): string {
    const id = this.sampleId();
    const node = id ? this.assets.node(id) : undefined;

    return node ? formatRollup(field, this.rollups.valueFor(node.id, field.metric)) : '';
  }

  protected toggleSeverity(severity: AlarmSeverityKey, on: boolean): void {
    this.picked.update((current) =>
      on
        ? ALARM_SEVERITIES.filter((s) => s === severity || current.includes(s))
        : current.filter((s) => s !== severity)
    );
  }

  protected startAdding(): void {
    this.adding.set(true);
    this.label.set('');
    this.unit.set('');
  }

  protected async add(): Promise<void> {
    const metric = this.draft();

    if (!metric || this.duplicate()) return;
    const field: RollupField = {
      label: this.label().trim(),
      metric,
      ...(metric.kind === 'availability' && metric.state === 'available'
        ? { display: 'ratio' as const }
        : {}),
      ...(this.unit().trim() ? { unit: this.unit().trim() } : {}),
    };
    const hadLatest = needsLatestValues(this.settings.settings().rollups);

    await this.write({ ...this.set(), fields: [...this.set().fields, field] });
    this.adding.set(false);
    // The first measurement rollup: sweep again, now with the latest values.
    if (!hadLatest && needsLatestValues(this.settings.settings().rollups))
      void this.assets.refresh();
  }

  // ── list edits ───────────────────────────────────────────────────────────────────────────

  protected async remove(field: RollupField): Promise<void> {
    const id = rollupFieldId(field);
    const set = this.set();

    await this.write({
      fields: set.fields.filter((candidate) => rollupFieldId(candidate) !== id),
      badge: set.badge === id ? null : set.badge,
    });
  }

  protected async drop(event: CdkDragDrop<unknown>): Promise<void> {
    const fields = [...this.set().fields];

    moveItemInArray(fields, event.previousIndex, event.currentIndex);
    await this.write({ ...this.set(), fields });
  }

  protected async setBadge(id: string): Promise<void> {
    await this.write({ ...this.set(), badge: id || null });
  }

  protected async reset(): Promise<void> {
    await this.settings.resetRollups(this.assetType());
  }

  private async write(set: RollupSet): Promise<void> {
    await this.settings.setRollups(this.assetType(), set);
  }
}
