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
  ALARM_SEVERITIES,
  availabilityLabel,
  type AssetNode,
  type AssetRollup,
} from '../../services/asset-store/asset-store.model';
import { AssetIconService } from '../../services/asset-store/asset-icon.service';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import {
  isResolvable,
  readPath,
  type DetailFieldSpec,
} from '../../services/asset-store/metric-spec.model';
import { detailFieldFor, resolveDetailFieldKeys } from './asset-detail-fields';
import { AssetDetailService, type AssetLatestValues } from './asset-detail.service';
import { AssetTreeService } from './asset-tree.service';

/**
 * The AI-context id the panel reports under. Exported so a container can focus the chat
 * on the panel without hard-coding the string.
 */
export const DETAIL_CONTEXT_ID = 'ps.asset-navigator.detail';

/** One rendered row of the panel. `value === null` means "no data", not "zero". */
interface DetailRow {
  key: string;
  label: string;
  render: 'number' | 'percent' | 'status' | 'alarms' | 'text' | 'date';
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
  /** Hides the ⚙ where there is no third cascade level to open. */
  readonly configurable = input(true);

  readonly openConfig = output<void>();
  readonly open = output<{ newTab: boolean }>();
  readonly openAlarms = output<void>();
  readonly pinToggled = output<void>();

  private readonly assets = inject(AssetStoreService);
  private readonly details = inject(AssetDetailService);
  private readonly tree = inject(AssetTreeService);

  private readonly latest = signal<AssetLatestValues | null>(null);
  private readonly sparklinePoints = signal<number[] | null>(null);
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
   * Whether this asset is a group rather than a turbine. Keyed off the store's configured
   * `leafType` rather than child count: a park with no turbines yet is still a park, and
   * must not be described with turbine fields it will never have.
   */
  protected readonly isBranch = computed(() => {
    const node = this.node();
    return !!node && node.type !== this.assets.config().leafType;
  });

  /**
   * The fields to render, for **this asset's type** — a park and a turbine are configured
   * independently (§6.3). Branch types default to nothing here: their identity is the
   * rollup rows below, and configured fields are additions to them.
   */
  protected readonly fieldKeys = computed<readonly string[]>(() =>
    resolveDetailFieldKeys(this.tree.configuredFieldKeys(this.node()?.type), this.isBranch())
  );

  protected readonly pinned = computed(() => this.tree.isPinned(this.assetId()));
  protected readonly showSparkline = computed(() => this.tree.sparkline());

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
    const configured = this.fieldKeys()
      .map((key) => detailFieldFor(key))
      .filter((field): field is NonNullable<typeof field> => field !== undefined)
      .map((field) => this.toRow(field, node, rollup));

    // A group is not a turbine with missing data — it is a different subject (see
    // `branchRows`), so its rollup rows always come first and anything configured for
    // its type is an addition rather than a replacement.
    return this.isBranch() ? [...branchRows(rollup), ...configured] : configured;
  });

  /** One configured field, resolved against the store, the rollup, and the lazy read. */
  private toRow(field: DetailFieldSpec, node: AssetNode, rollup: AssetRollup): DetailRow {
    const { spec } = field;
    const render = field.render ?? 'text';

    if (!isResolvable(spec)) {
      return { key: spec.key, label: field.label, render, value: null, unavailable: true };
    }

    if (spec.kind === 'alarm') {
      // A branch reports its subtree, a leaf its own — the same number the row's dot
      // is drawn from, so panel and tree can never disagree.
      const counts = node.childIds.length ? rollup.alarms : node.alarms;
      const summary = ALARM_SEVERITIES.filter((severity) => counts[severity] > 0)
        .map((severity) => `${counts[severity]} ${severity}`)
        .join(', ');
      return {
        key: spec.key,
        label: field.label,
        render,
        value: summary || gettext('None'),
        unavailable: false,
      };
    }

    if (spec.kind === 'mo') {
      // `status` is derived rather than read: the raw `wnd_Status` map is a code
      // table, and the panel's job is to say what it means in words (NFR-T3).
      if (render === 'status') {
        return {
          key: spec.key,
          label: field.label,
          render,
          value: availabilityLabel(node.availability),
          unavailable: false,
        };
      }

      return {
        key: spec.key,
        label: field.label,
        render,
        value: formatValue(readPath(node.properties, spec.path), field.precision, field.unit),
        unavailable: false,
      };
    }

    // measurement / latest
    const reading = this.latest()?.values[spec.series];

    if (!reading) {
      return {
        key: spec.key,
        label: field.label,
        render,
        // Distinguish "not read yet" from "the asset does not report it": while the
        // read is in flight the row shows a placeholder, afterwards a dash.
        value: this.loading() ? null : '—',
        unavailable: false,
      };
    }

    return {
      key: spec.key,
      label: field.label,
      render,
      value: formatValue(reading.value, field.precision, field.unit ?? reading.unit),
      unavailable: false,
    };
  }

  /** Normalised sparkline polyline points, or `null` while there is nothing to draw. */
  protected readonly sparklinePath = computed(() => {
    const points = this.sparklinePoints();

    if (!points || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const span = max - min || 1;
    const stepX = 100 / (points.length - 1);
    return points
      .map(
        (value, index) =>
          `${(index * stepX).toFixed(2)},${(24 - ((value - min) / span) * 24).toFixed(2)}`
      )
      .join(' ');
  });

  constructor() {
    // One effect drives the whole lazy load, keyed on (asset, selected fields,
    // sparkline). Changing the asset cancels the previous asset's in-flight read, which
    // is what "cancelled on pointer-out" buys us when the pointer crosses rows.
    effect((onCleanup) => {
      const assetId = this.assetId();
      const fieldKeys = this.fieldKeys();
      const wantsSparkline = this.tree.sparkline();

      // A group has no measurement series of its own — hovering one used to spend a
      // request per hover to learn that. Branch rows come from the tier-0 rollup.
      if (this.isBranch()) {
        this.latest.set(null);
        this.sparklinePoints.set(null);
        this.loading.set(false);
        this.failed.set(false);

        return;
      }

      const cached = this.details.cachedLatest(assetId);

      this.latest.set(cached ?? null);
      this.sparklinePoints.set(this.details.cachedSparkline(assetId)?.points ?? null);
      this.failed.set(false);

      const handles: { cancel: () => void }[] = [];
      // Cancelling a handle only makes it resolve `null` — the promise still settles, and
      // by then this run may be for a row the pointer has left. Applying that `null` would
      // paint the *new* asset's panel as failed and clear its loading placeholder, so every
      // continuation checks the latch first.
      let stale = false;

      if (!cached) {
        this.loading.set(true);
        const handle = this.details.loadLatest(assetId, fieldKeys);

        handles.push(handle);
        void handle.result.then((values) => {
          if (stale) return;
          this.loading.set(false);
          if (values) this.latest.set(values);
          else this.failed.set(true);
        });
      }

      if (wantsSparkline && !this.details.cachedSparkline(assetId)) {
        const handle = this.details.loadSparkline(assetId);

        handles.push(handle);
        void handle.result.then((sparkline) => {
          if (stale || !sparkline) return;
          this.sparklinePoints.set(sparkline.points);
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

  /**
   * What the panel currently shows, in words — the rows as rendered, including the
   * "not available" ones, so the assistant can tell a missing data source from a
   * healthy turbine (`docs/ContextAwareAIChat/ui-to-ai-context.spec.md`).
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
        // Availability is a turbine property. Reporting a group's `'unknown'` invited the
        // assistant to describe a healthy region as being in an unknown state.
        status: this.isBranch() ? null : node.availability,
        subtree: {
          turbines: rollup.turbineCount || null,
          notProducing: rollup.unavailableCount || null,
          worstAlarm: rollup.worst ?? 'none',
        },
        pinned: this.pinned(),
        // Exactly the label/value pairs on screen, in the user's configured order.
        fields: this.rows().map((row) => ({
          label: row.label,
          value: row.unavailable ? 'not available (no data source)' : (row.value ?? 'loading'),
        })),
        sparkline:
          this.showSparkline() && !this.isBranch()
            ? { series: 'power, 24 h', points: this.sparklinePoints()?.length ?? 0 }
            : null,
        liveValuesFailed: this.failed(),
      },
      metaData: { widgetType: 'ps.asset-detail-panel', assetId: node.id },
    });
  }
}

/**
 * What a **branch** reports. A region/area/park has no `IECMeasurement` series of its
 * own, so running the turbine field catalogue against one produced a panel of dashes with
 * a single filled row (subtree alarms) — which read as broken data rather than as "this
 * is a group". Branches describe their subtree instead, entirely from the tier-0 rollup:
 * no request, and every row is a number the tree's own dot and count already agree with.
 *
 * The ⚙ field configuration deliberately does not apply here — it configures the turbine
 * panel, and a group has nothing to choose from.
 */
function branchRows(rollup: AssetRollup): DetailRow[] {
  const producing = Math.max(
    0,
    rollup.turbineCount - rollup.unavailableCount - rollup.deratedCount
  );
  const alarmSummary = ALARM_SEVERITIES.filter((severity) => rollup.alarms[severity] > 0)
    .map((severity) => `${rollup.alarms[severity]} ${severity}`)
    .join(', ');

  return [
    {
      key: 'turbines',
      label: gettext('Turbines'),
      render: 'text',
      value: String(rollup.turbineCount),
      unavailable: false,
    },
    {
      key: 'producing',
      label: gettext('Producing'),
      render: 'text',
      value: `${producing} ${gettext('of')} ${rollup.turbineCount}`,
      unavailable: false,
    },
    {
      key: 'derated',
      label: gettext('Derated'),
      render: 'text',
      value: String(rollup.deratedCount),
      unavailable: false,
    },
    {
      key: 'notProducing',
      label: gettext('Not producing'),
      render: 'text',
      value: String(rollup.unavailableCount),
      unavailable: false,
    },
    {
      key: 'alarms',
      label: gettext('Alarms'),
      render: 'alarms',
      value: alarmSummary || gettext('None'),
      unavailable: false,
    },
  ];
}

function formatValue(raw: unknown, precision?: number, unit?: string): string {
  if (raw === null || raw === undefined || raw === '') return '—';

  if (typeof raw === 'number') {
    const text = raw.toFixed(precision ?? 1);
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
