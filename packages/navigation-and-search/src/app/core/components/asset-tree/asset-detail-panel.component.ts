import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { injectAiContextReporter } from '../../services/ai-context.service';
import {
  alarmSummary,
  availabilityLabel,
  countUnitFor,
  effectiveAvailability,
  unitCount,
  type AssetNode,
  type AssetRollup,
  type CountUnit,
} from '../../services/asset-store/asset-store.model';
import { AssetDefinitionService } from '../../services/asset-store/asset-definition.service';
import { AssetIconService } from '../../services/asset-store/asset-icon.service';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import {
  detailFieldId,
  fieldsForType,
  type DetailField,
} from '../../services/settings/detail-panel.model';
import { NavigatorSettingsService } from '../../services/settings/navigator-settings.service';
import { readPath } from './asset-detail-fields';
import { AssetDetailService, type AssetLatestValues } from './asset-detail.service';
import { AssetTreeService } from './asset-tree.service';
import { RollupService } from './rollup.service';

/**
 * The AI-context id the panel reports under. Exported so a container can focus the chat
 * on the panel without hard-coding the string.
 */
export const DETAIL_CONTEXT_ID = 'ps.asset-navigator.detail';

/** One rendered row of the panel. `value === null` means "no data", not "zero". */
export interface DetailRow {
  key: string;
  label: string;
  /** `status` and `alarms` have their own presentation; everything else is text. */
  render: 'status' | 'alarms' | 'text';
  value: string | null;
  /** Set when the field is declared but its data path does not exist yet. */
  unavailable: boolean;
}

/**
 * The configurable hover detail (§6.2). Its purpose is triage: it removes the
 * click → read → back → click loop that dominates fault-finding, so it has to be
 * readable at a glance and never block navigation.
 *
 * Resilience (NFR-T5): tier-0 fields render from the store immediately, the lazy
 * latest-values read fills the rest in, and a failed read leaves those rows marked
 * unavailable rather than emptying the panel.
 */
@Component({
  selector: 'ps-asset-detail-panel',
  templateUrl: './asset-detail-panel.component.html',
  styleUrls: ['./asset-detail-panel.component.less'],
  imports: [CoreModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetDetailPanelComponent {
  readonly assetId = input.required<string>();
  /**
   * Shows the Open / New tab / Pin / Alarms row. Off where the panel is a preview of the
   * configured fields (the settings drawer), not a way into the asset.
   */
  readonly actions = input(true);

  readonly open = output<{ newTab: boolean }>();
  readonly openAlarms = output<void>();
  readonly pinToggled = output<void>();

  private readonly assets = inject(AssetStoreService);
  private readonly details = inject(AssetDetailService);
  private readonly tree = inject(AssetTreeService);
  private readonly settings = inject(NavigatorSettingsService);
  private readonly definitions = inject(AssetDefinitionService);
  private readonly rollups = inject(RollupService);

  private readonly latest = signal<AssetLatestValues | null>(null);
  protected readonly loading = signal(false);
  protected readonly failed = signal(false);

  protected readonly node = computed<AssetNode | undefined>(() => this.assets.node(this.assetId()));
  protected readonly rollup = computed(() => this.assets.rollupOf(this.assetId()));
  protected readonly path = computed(() => this.assets.pathLabel(this.assetId()));
  // Same resolver as the tree row, so the panel header and the row it grew out of can
  // never show different icons for one asset.
  private readonly icons = inject(AssetIconService);
  protected readonly icon = computed(() => {
    const node = this.node();
    return node ? this.icons.iconFor(node) : '';
  });

  /**
   * Whether this asset is a group: it has child assets (loaded, or known to be pending in
   * `high-volume` mode). A branch describes its subtree instead of itself — its rollups.
   */
  protected readonly isBranch = computed(() => {
    const node = this.node();

    if (!node) return false;

    return node.childIds.length > 0 || !!this.assets.hierarchy()?.pendingChildren.has(node.id);
  });

  /** "Devices" or "Assets" — the same choice as the footer and the row badges. */
  private readonly unit = computed<CountUnit>(() => countUnitFor(this.definitions.available()));

  /**
   * The fields to render for **this asset's type**, from the detail-panel data contract in the
   * navigator settings (`fieldsForType`): the type's own list, else the default list for a
   * leaf and nothing for a branch.
   */
  protected readonly fields = computed<readonly DetailField[]>(() =>
    fieldsForType(this.settings.settings().detailPanel, this.node()?.type, this.isBranch())
  );

  protected readonly pinned = computed(() => this.tree.isPinned(this.assetId()));

  /**
   * The panel reports its context but hosts **no AI button of its own**: it is a hover
   * surface, and the popover covered the very fields the question was about wherever the
   * trigger sat. The context stays published under this id, so the assistant answers about
   * the hovered asset when asked from the container's own AI entry point.
   */
  private readonly aiContext = injectAiContextReporter(DETAIL_CONTEXT_ID, {
    onRefresh: () => this.reportContext(),
  });

  protected readonly rows = computed<DetailRow[]>(() => {
    const node = this.node();

    if (!node) return [];
    const rollup = this.rollup();
    const configured = this.fields().map((field) => this.toRow(field, node, rollup));

    // A group is not a leaf with missing data — it is a different subject, so its rollups
    // (configured per type, `RollupService`) come first and its fields are additions.
    if (!this.isBranch()) return configured;
    const rollups = this.rollups.rows(node).map((row) => ({ ...row, unavailable: false }));

    return [...rollups, ...configured];
  });

  constructor() {
    // One effect drives the whole lazy load, keyed on (asset, selected fields). Changing the
    // asset cancels the previous asset's in-flight read, which
    // is what "cancelled on pointer-out" buys us when the pointer crosses rows.
    effect((onCleanup) => {
      const assetId = this.assetId();
      const fields = this.fields();

      // A group's rows come from the tier-0 rollup — hovering one must not spend a request. Branch rows come from the tier-0 rollup.
      if (this.isBranch()) {
        this.latest.set(null);
        this.loading.set(false);
        this.failed.set(false);

        return;
      }

      const cached = this.details.cachedLatest(assetId);

      this.latest.set(cached ?? null);
      this.failed.set(false);

      const handles: { cancel: () => void }[] = [];
      // Cancelling a handle only makes it resolve `null` — the promise still settles, and
      // by then this run may be for a row the pointer has left. Applying that `null` would
      // paint the *new* asset's panel as failed and clear its loading placeholder, so every
      // continuation checks the latch first.
      let stale = false;

      if (!cached) {
        this.loading.set(true);
        const handle = this.details.loadLatest(assetId, fields);

        handles.push(handle);
        void handle.result.then((values) => {
          if (stale) return;
          this.loading.set(false);
          if (values) this.latest.set(values);
          else this.failed.set(true);
        });
      }

      onCleanup(() => {
        stale = true;
        for (const handle of handles) handle.cancel();
      });
    });

    effect(() => this.reportContext());
  }

  protected onPin(): void {
    this.pinToggled.emit();
  }

  /** One configured field, resolved against the store, the rollup, and the lazy read. */
  private toRow(field: DetailField, node: AssetNode, rollup: AssetRollup): DetailRow {
    const { source } = field;
    const row = (render: DetailRow['render'], value: string | null): DetailRow => ({
      key: detailFieldId(field),
      label: field.label,
      render,
      value,
      unavailable: false,
    });

    switch (source.kind) {
      case 'alarms':
        // The subtree, attached devices included — the same number the row's dot is drawn
        // from, so panel and tree can never disagree.
        return row('alarms', alarmSummary(rollup.alarms) ?? gettext('None'));
      case 'availability':
        return row('status', availabilityLabel(effectiveAvailability(node, rollup)));
      case 'type':
        return row('text', node.type || '—');
      case 'lastUpdated':
        return row('text', formatValue(node.properties['lastUpdated'], field, 'date'));
      case 'property':
        return row('text', formatValue(readPath(node.properties, source.path), field));

      case 'measurement': {
        const reading = this.latest()?.values[source.series];

        // Distinguish "not read yet" from "the asset does not report it": while the read is
        // in flight the row shows a placeholder, afterwards a dash.
        if (!reading) return row('text', this.loading() ? null : '—');

        return row(
          'text',
          formatValue(reading.value, { ...field, unit: field.unit ?? reading.unit }, 'number')
        );
      }
    }
  }

  /**
   * What the panel currently shows, in words — the rows as rendered, including the
   * "not available" ones, so the assistant can tell a missing data source from a
   * healthy device (`docs/ContextAwareAIChat/ui-to-ai-context.spec.md`).
   */
  private reportContext(): void {
    const node = this.node();

    if (!node) {
      this.aiContext.report({
        name: gettext('Asset details'),
        contextData: { state: 'asset no longer available' },
        metaData: { widgetType: 'ps.asset-detail-panel' },
      });

      return;
    }
    const rollup = this.rollup();

    this.aiContext.report({
      name: gettext('Asset details'),
      contextData: {
        asset: { name: node.name, type: node.type, path: this.path() },
        // Reporting a group's `'unknown'` invited the assistant to describe a healthy group as
        // being in an unknown state; its subtree counts say it instead.
        status: this.isBranch() ? null : effectiveAvailability(node, rollup),
        subtree: {
          [this.unit()]: unitCount(rollup, this.unit()) || null,
          unavailableDevices: rollup.unavailableCount || null,
          worstAlarm: rollup.worst ?? 'none',
        },
        pinned: this.pinned(),
        // Exactly the label/value pairs on screen, in the user's configured order.
        fields: this.rows().map((row) => ({
          label: row.label,
          value: row.unavailable ? 'not available (no data source)' : (row.value ?? 'loading'),
        })),
        liveValuesFailed: this.failed(),
      },
      metaData: { widgetType: 'ps.asset-detail-panel', assetId: node.id },
    });
  }
}

/** A value as text, per the field's `format` (or `fallback` when the field names none). */
export function formatValue(
  raw: unknown,
  field: Pick<DetailField, 'format' | 'unit' | 'precision'>,
  fallback: DetailField['format'] = 'text'
): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const format = field.format ?? fallback;
  const unit = field.unit;

  if (format === 'date') {
    const date = new Date(typeof raw === 'number' || typeof raw === 'string' ? raw : NaN);

    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
  }
  // `text` keeps a number as stored (a year, an id) unless a precision asks for rounding.
  const numeric =
    format !== 'text' || (typeof raw === 'number' && field.precision !== undefined)
      ? Number(raw)
      : NaN;

  if (typeof raw !== 'boolean' && Number.isFinite(numeric)) {
    const text = numeric.toFixed(field.precision ?? 1);

    if (format === 'percent') return `${text} %`;

    return unit ? `${text} ${unit}` : text;
  }
  if (typeof raw === 'boolean') return raw ? gettext('Yes') : gettext('No');
  if (typeof raw === 'object') return '—';

  if (!isScalar(raw)) return '—';
  const text = String(raw);
  return unit ? `${text} ${unit}` : text;
}

/** Scalars `String()` renders meaningfully (objects are handled separately by callers). */
function isScalar(value: unknown): value is string | number | boolean | bigint {
  const kind = typeof value;
  return kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint';
}
