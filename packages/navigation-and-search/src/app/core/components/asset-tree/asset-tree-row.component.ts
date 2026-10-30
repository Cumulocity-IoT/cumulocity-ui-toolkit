import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { AssetIconService } from '../../services/asset-store/asset-icon.service';
import { StatusDotComponent } from '../status-dot/status-dot.component';
import { describeDot } from '../status-dot/status-dot.model';
import {
  markSegments,
  rowIndent,
  type AssetTreeConfig,
  type AssetTreeRow,
} from './asset-tree.model';
import type { BranchStatus } from '../../services/asset-store/asset-store.model';
import { RollupService } from './rollup.service';

/**
 * One tree row (§3.2). Pure and `OnPush`: it derives everything from its inputs and
 * emits intent, so a 114-child expansion repaints nothing it does not have to
 * (NFR-T1). The row does not know about the store, the cascade, or routing.
 *
 * Row anatomy:
 * ```
 * [twisty][type icon][ name ─────────────── ][ count ][status dot]
 *    24px     16px      flex, ellipsis last resort   11px    8px
 * ```
 */
@Component({
  selector: 'ps-asset-tree-row',
  templateUrl: './asset-tree-row.component.html',
  styleUrls: ['./asset-tree-row.component.less'],
  imports: [CoreModule, StatusDotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetTreeRowComponent {
  readonly row = input.required<AssetTreeRow>();
  readonly config = input.required<AssetTreeConfig>();
  readonly selected = input(false);
  readonly focused = input(false);
  readonly pinned = input(false);
  /** Total rows and this row's 1-based position, for `aria-setsize`/`aria-posinset`. */
  readonly setSize = input(0);
  readonly posInSet = input(0);
  /**
   * `high-volume` mode: how this branch's children are doing. `undefined` in `full` mode, and for
   * any branch nobody has opened.
   */
  readonly branchStatus = input<BranchStatus | undefined>(undefined);
  /** Children known to exist but not held — drives the explicit "load more". */
  readonly missingChildren = input(0);

  readonly toggle = output<void>();
  readonly activate = output<{ newTab: boolean }>();
  readonly pick = output<void>();
  /** The explicit touch/keyboard affordance for the detail panel (§6.5). */
  readonly showDetail = output<void>();
  /** Pull the next page of this branch's children (`high-volume` mode only). */
  readonly loadMore = output<void>();

  private readonly icons = inject(AssetIconService);
  private readonly rollups = inject(RollupService);

  protected readonly indent = computed(() => rowIndent(this.row().depth));

  /**
   * Resolved through the platform's asset API (see `AssetIconService`), so a tenant's custom
   * asset-type icon shows up here exactly as it does in the platform's group navigation.
   * Never empty — the service returns a static guess while the lookup is in flight, because
   * the template renders the icon unconditionally and a blank `c8yIcon` leaves a ragged gap.
   */
  protected readonly icon = computed(() => this.icons.iconFor(this.row().node));

  protected readonly segments = computed(() => {
    const row = this.row();
    return markSegments(row.node.name, row.matches);
  });

  /**
   * The rolled-up status dot (§3.3). Colour is the worst active alarm severity in the
   * subtree; the ring marks unavailable devices in it. Encoding both is deliberate —
   * an unavailable device with no alarm is exactly the case a severity-only dot hides
   * (OQ-T1, resolved: both).
   */
  protected readonly dot = computed(() => {
    const { rollup, node } = this.row();
    return {
      // `worst ?? 'ok'` — the alarm severity only. Availability is the *fill*, passed
      // separately, so it must not be smuggled in here as a severity: this used to resolve to
      // `'unavailable'` when nothing was alarmed, which matched no colour rule (leaving the
      // base green) *and* stopped the intended `--ok.--unavailable` grey rule from applying.
      // An alarm-free unavailable device therefore rendered a green ring; it is now grey.
      // The configured dot severities (settings drawer): a minor alarm can be left uncoloured.
      severity: this.rollups.dotSeverity(rollup) ?? 'ok',
      unavailable: rollup.unavailableCount > 0 || node.availability === 'unavailable',
    };
  });

  /**
   * Spoken and hover description of the dot — the colour in words (NFR-T3).
   *
   * When the subtree is only partly loaded the dot has been narrowed to this asset's *own*
   * severity (see `computeRollup`), so the words have to say that much too: "2 critical" about a
   * group whose 500 members are unread would be a claim about data nobody has.
   */
  protected readonly dotTitle = computed(() => {
    const { rollup, node } = this.row();

    if (rollup.partial) {
      return `${describeDot({ alarms: node.alarms })} on this asset · subtree not fully loaded`;
    }

    return describeDot({
      alarms: rollup.alarms,
      unavailableCount: rollup.unavailableCount,
    });
  });

  /** A spinner belongs on the twisty while this branch's children are on the wire. */
  protected readonly branchLoading = computed(() => this.branchStatus() === 'loading');
  protected readonly branchFailed = computed(() => this.branchStatus() === 'error');

  /**
   * The branch badge — the rollup configured for this branch's type (settings drawer → By level;
   * by default the descendant count, assets with the Digital Twin Manager, devices otherwise).
   * Leaves show nothing (§3.3).
   *
   * Suppressed entirely for a partly-loaded subtree: the number would be a floor, and "3" on a
   * group with 500 members is worse than no number at all.
   */
  protected readonly badge = computed(() => {
    const row = this.row();

    if (!this.config().showCounts || !row.hasChildren || row.rollup.partial) return null;

    return this.rollups.badge(row.node);
  });

  protected onLoadMore(event: MouseEvent): void {
    event.stopPropagation();
    this.loadMore.emit();
  }

  protected onToggle(event: MouseEvent): void {
    // The twisty must never also select — expanding to look inside is not choosing.
    event.stopPropagation();
    this.toggle.emit();
  }

  protected onClick(event: MouseEvent): void {
    if (event.altKey || event.metaKey || event.ctrlKey) {
      this.activate.emit({ newTab: true });

      return;
    }
    this.pick.emit();
  }

  protected onDoubleClick(): void {
    this.activate.emit({ newTab: false });
  }

  protected onDetail(event: Event): void {
    event.stopPropagation();
    this.showDetail.emit();
  }
}
