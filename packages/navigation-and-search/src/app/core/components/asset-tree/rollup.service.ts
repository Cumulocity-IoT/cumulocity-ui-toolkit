import { Injectable, computed, inject } from '@angular/core';
import { gettext } from '@c8y/ngx-components/gettext';
import { AssetDefinitionService } from '../../services/asset-store/asset-definition.service';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import {
  alarmSummary,
  countUnitFor,
  type AlarmSeverityKey,
  type AssetHierarchy,
  type AssetNode,
  type AssetRollup,
} from '../../services/asset-store/asset-store.model';
import { NavigatorSettingsService } from '../../services/settings/navigator-settings.service';
import {
  computeMetric,
  dotSeverity,
  metricLabel,
  rollupFieldId,
  rollupsForType,
  type RollupField,
  type RollupMetric,
  type RollupValue,
} from '../../services/settings/rollup.model';
import { AssetTreeService } from './asset-tree.service';

/** One rendered rollup: a detail panel row of a branch, or its badge. */
export interface RollupRow {
  key: string;
  label: string;
  /** `alarms` rows render with the alarm styling. */
  render: 'alarms' | 'text';
  /** Formatted for display; `—` when there is nothing to aggregate. */
  value: string;
}

/**
 * The configured rollups (`NavigatorSettings.rollups`, see `rollup.model.ts`), evaluated over the
 * hierarchy the tree shows: branch badges, the detail panel's branch rows and the status dot's
 * colour.
 *
 * Each metric is computed for every node in one bottom-up pass and memoised per hierarchy, so a
 * whole tree of badges costs one pass per configured metric per sweep, never a request.
 */
@Injectable({ providedIn: 'root' })
export class RollupService {
  private readonly tree = inject(AssetTreeService);
  private readonly assets = inject(AssetStoreService);
  private readonly settings = inject(NavigatorSettingsService);
  private readonly definitions = inject(AssetDefinitionService);

  private readonly config = computed(() => this.settings.settings().rollups);
  private readonly unit = computed(() => countUnitFor(this.definitions.available()));

  /** Per hierarchy object (a new one every sweep), per metric id and unit: the values. */
  private readonly cache = new WeakMap<AssetHierarchy, Map<string, Map<string, RollupValue>>>();

  /** The severity that colours a dot, from the subtree's alarm counts. */
  dotSeverity(rollup: AssetRollup): AlarmSeverityKey | null {
    // `worst` is narrowed to the node's own severity for a partly loaded subtree; keep that.
    if (rollup.partial) return rollup.worst;

    return dotSeverity(rollup.alarms, this.config().dotSeverities);
  }

  /** The badge of a branch row, or `null` (no badge configured, or nothing to show). */
  badge(node: AssetNode): RollupRow | null {
    const set = rollupsForType(this.config(), node.type);
    const field = set.badge
      ? set.fields.find((candidate) => rollupFieldId(candidate) === set.badge)
      : undefined;

    if (!field) return null;
    const value = this.valueFor(node.id, field.metric);

    // An empty count is no badge, as before; a measured 0 is a value.
    if (value?.value === null || value?.value === undefined) return null;
    if (value.value === 0 && isCount(field.metric)) return null;

    return this.row(field, value);
  }

  /** The detail panel rows of a branch, in their configured order. */
  rows(node: AssetNode): RollupRow[] {
    return rollupsForType(this.config(), node.type).fields.map((field) =>
      this.row(field, this.valueFor(node.id, field.metric))
    );
  }

  /** The label a field shows: its own, else its metric's. */
  labelOf(field: RollupField): string {
    return field.label || metricLabel(field.metric, this.unit());
  }

  /**
   * The metric's value for `id` — over the tree's hierarchy, or the store's when the asset is
   * not in the tree (the permanent filter hides it, e.g. in the settings drawer's preview).
   */
  valueFor(id: string, metric: RollupMetric): RollupValue | undefined {
    const treeHierarchy = this.tree.hierarchy();
    const hierarchy = treeHierarchy?.byId.has(id) ? treeHierarchy : this.assets.hierarchy();

    if (!hierarchy) return undefined;

    return this.valuesFor(hierarchy, metric).get(id);
  }

  private row(field: RollupField, value: RollupValue | undefined): RollupRow {
    const breakdown = field.display === 'breakdown' && field.metric.kind === 'alarms';

    return {
      key: rollupFieldId(field),
      label: this.labelOf(field),
      render: breakdown ? 'alarms' : 'text',
      value: formatRollup(field, value),
    };
  }

  private valuesFor(hierarchy: AssetHierarchy, metric: RollupMetric): Map<string, RollupValue> {
    const unit = this.unit();
    const key = `${unit}|${rollupFieldId({ metric })}`;
    let perHierarchy = this.cache.get(hierarchy);

    if (!perHierarchy) {
      perHierarchy = new Map();
      this.cache.set(hierarchy, perHierarchy);
    }
    let values = perHierarchy.get(key);

    if (!values) {
      values = computeMetric(hierarchy, metric, unit);
      perHierarchy.set(key, values);
    }

    return values;
  }
}

function isCount(metric: RollupMetric): boolean {
  return metric.kind !== 'property' && metric.kind !== 'measurement';
}

/** A rollup value as text, per the field's display, unit and precision. */
export function formatRollup(field: RollupField, value: RollupValue | undefined): string {
  if (!value || value.value === null) return '—';

  if (field.display === 'breakdown' && value.alarms) {
    return alarmSummary(value.alarms) ?? gettext('None');
  }

  if (field.display === 'ratio' && value.of !== undefined) {
    return `${value.value} ${gettext('of')} ${value.of}`;
  }
  const text = isCount(field.metric)
    ? String(value.value)
    : value.value.toLocaleString(undefined, {
        maximumFractionDigits: field.precision ?? 1,
        minimumFractionDigits: 0,
      });

  return field.unit ? `${text} ${field.unit}` : text;
}
