import { ScrollingModule, type CdkVirtualScrollViewport } from '@angular/cdk/scrolling';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { AlertService, CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { filter as filterEvents, map } from 'rxjs/operators';
import { cappedList } from '../../helpers/ai-context.helper';
import { AiContextService } from '../../services/ai-context.service';
import {
  alarmedUnitCount,
  countUnitFor,
  effectiveAvailability,
  unitCount,
  type AssetNode,
  type BranchStatus,
  type CountUnit,
} from '../../services/asset-store/asset-store.model';
import { AssetDefinitionService } from '../../services/asset-store/asset-definition.service';
import {
  globalSearchAvailable,
  openGlobalSearch,
} from '../../services/search/global-search-channel';
import { connectAssetStore } from '../../services/asset-store/asset-store.service';
import { StatusDotComponent } from '../status-dot/status-dot.component';
import type { DotSeverity } from '../status-dot/status-dot.model';
import { AssetDetailPanelComponent } from './asset-detail-panel.component';
import { AssetTreeRowComponent } from './asset-tree-row.component';
import {
  ROW_HEIGHT,
  autoExpansionFor,
  flatten,
  type AssetActivation,
  type AssetTreeConfig,
  type AssetTreeRow,
  branchesToLoad,
} from './asset-tree.model';
import { AssetTreeService } from './asset-tree.service';
import { CascadeController } from './cascade-controller';
import { CascadePanelComponent } from './cascade-panel.component';
import { DetailFieldConfigComponent } from './detail-field-config.component';
import { QuickAccessPanelComponent } from './quick-access-panel.component';
import { QuickAccessRowComponent, type QuickAccessItem } from './quick-access-row.component';
import { NavigatorSettingsService } from '../../services/settings/navigator-settings.service';

/** Level-by-level reveal: delay per depth, and the depth at which the stagger stops. */
const REVEAL_STEP_MS = 45;
const REVEAL_MAX_LEVELS = 5;
/** How long the whole reveal may take before it is considered finished. */
const REVEAL_TOTAL_MS = REVEAL_STEP_MS * REVEAL_MAX_LEVELS + 250;

/** Rows of context left above a row that had to be scrolled into view. */
const SCROLL_HEADROOM_ROWS = 2;

const DETAIL_PANEL_WIDTH = 300;
/**
 * Height the detail cascade may take before it starts scrolling. The panel's own content —
 * header, path, seven fields, action row — runs to ~360px, and the cascade's 320px
 * default silently cut the action row off the bottom (a hover panel gives no hint that it
 * scrolls). Still clamped to what the container can actually show.
 */
const DETAIL_PANEL_HEIGHT = 420;
const CONFIG_PANEL_WIDTH = 240;
/** Quick-access panel: wider than the detail panel, because every entry carries its full path. */
const QUICK_ACCESS_PANEL_WIDTH = 320;
const QUICK_ACCESS_PANEL_HEIGHT = 480;

/**
 * The one asset-tree renderer (`docs/FastNavigation/tree-component-design.md` §3).
 *
 * **Non-negotiable: exactly one tree implementation.** The two containers — the
 * explorer drawer and the `⌘K` navigator overlay — differ only in the `config` they
 * pass and in which affordances that enables (§3.1). Two trees would drift within a
 * sprint.
 *
 * It takes no `items` input on purpose: it reads `AssetStoreService` and
 * `AssetTreeService` directly, so both containers are views onto one state and the
 * overlay opens showing exactly what the drawer left (AC-T3).
 */
@Component({
  selector: 'ps-asset-tree',
  templateUrl: './asset-tree.component.html',
  styleUrls: ['./asset-tree.component.less'],
  imports: [
    CoreModule,
    ScrollingModule,
    AssetTreeRowComponent,
    QuickAccessRowComponent,
    QuickAccessPanelComponent,
    CascadePanelComponent,
    AssetDetailPanelComponent,
    DetailFieldConfigComponent,
    StatusDotComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssetTreeComponent {
  readonly config = input.required<AssetTreeConfig>();
  /**
   * The element the cascade is measured against — the container's own box. Used for the
   * default `cascadeFromLeft` (its width) when the container does not pass one.
   * Required when `config.cascade === 'right-edge'` unless `cascadeFromLeft` is given.
   */
  readonly cascadeHost = input<ElementRef<HTMLElement> | undefined>(undefined);
  /** Left offset for the cascade, i.e. the container's current right edge in px. */
  readonly cascadeFromLeft = input(0);
  /**
   * Set while the container is being resized. The open panel closes rather than
   * chasing the moving edge (§6.4 rule 5) — re-anchoring per pointer-move looks like
   * the panel is trying to escape the grip.
   */
  readonly cascadeSuppressed = input(false);
  /**
   * The AI-context id this tree reports under. **Must be distinct per container**: the
   * drawer and the overlay can be open at the same time, and the context store keys
   * entries by id — sharing one would mean the second tree overwrites the first's entry,
   * and whichever is destroyed first retracts the entry the other is still publishing.
   */
  readonly contextId = input('ps.asset-navigator.tree');
  /**
   * Take keyboard focus as soon as the tree has rows, landing on "you are here" (or the
   * first row when the app is not on an asset). Set by the drawer, whose whole purpose is
   * traversal: opening it and having to click or Tab before the arrow keys do anything
   * makes the keyboard path a second-class one.
   *
   * The overlay leaves this `false` — it opens with the caret in its search field, and
   * stealing focus from there would break typing to filter.
   */
  readonly autoFocus = input(false);

  /** Every pick — a click on a hierarchy row or a Pinned/Recent entry. */
  readonly select = output<AssetNode>();
  readonly activate = output<AssetActivation>();
  /** `Esc` with no cascade panel open — the container decides what closing means. */
  readonly requestClose = output<void>();
  /**
   * Type-ahead: a printable character arrived while the tree had focus. §3.6 sends
   * those to the filter input, which belongs to the container, not to the tree.
   */
  readonly filterTyped = output<string>();

  private readonly assets = connectAssetStore();
  private readonly tree = inject(AssetTreeService);
  private readonly alerts = inject(AlertService);
  private readonly navigatorSettings = inject(NavigatorSettingsService);
  private readonly definitions = inject(AssetDefinitionService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly cascade = new CascadeController();
  private readonly viewport = viewChild<CdkVirtualScrollViewport>('viewport');
  protected readonly quickAccess = viewChild<QuickAccessRowComponent>('quickAccess');
  /** The quick-access wrapper — the cascade's anchor when opened by key or click. */
  private readonly quickSection = viewChild<ElementRef<HTMLElement>>('quickSection');

  /**
   * "You are here": the asset the surrounding app is currently showing, read from the
   * router rather than from tree state — the user may have arrived from a bookmark, a
   * dashboard link or the platform's own Groups tree, none of which go through us.
   */
  private readonly url = toSignal(
    this.router.events.pipe(
      filterEvents((event) => event instanceof NavigationEnd),
      map(() => this.router.url)
    ),
    { initialValue: this.router.url }
  );

  protected readonly currentAssetId = computed(() => {
    const match = /^\/(?:group|device)\/([^/?#]+)/.exec(this.url());
    return match ? match[1] : null;
  });

  /**
   * The asset the "you are here" reveal has already run for. A plain field, not a signal:
   * nothing renders from it, and it exists only to keep the reveal effect idempotent
   * across the store's polls.
   */
  private revealedId: string | null = null;
  /** `high-volume`: the asset a branch load has already been requested for. */
  private requestedReveal: string | null = null;
  /** Same latch for the no-current-asset case, which has no id to key on. */
  private revealedRoots = false;
  /** Latch for `autoFocus`: focus is taken once per tree instance, never on a re-poll. */
  private focusTaken = false;

  /** Whether the Pinned & Recent cascade panel is out (§6.1). */
  protected readonly quickAccessOpen = computed(
    () => this.showQuickAccess() && this.cascadeTarget()?.kind === 'quick-access'
  );

  /** The options menu can hide Pinned & Recent; hidden, its panel never opens either. */
  protected readonly showQuickAccess = computed(
    () => this.navigatorSettings.settings().showQuickAccess
  );

  protected readonly rowHeight = computed(() => ROW_HEIGHT[this.config().density]);

  /**
   * True only while the level-by-level reveal is running, i.e. the first render of a
   * `revealByLevel` container that has rows. It latches off after the longest stagger, so
   * the recycled rows a later scroll produces are not animated again — an animation that
   * re-fires on scroll reads as flicker, not as polish.
   */
  private readonly revealDone = signal(false);
  protected readonly revealing = computed(
    () => this.config().revealByLevel && !this.revealDone() && this.rows().length > 0
  );

  /** Ancestors of filter matches — kept apart from the user's expansion set (§3.5). */
  private readonly autoExpanded = computed(() =>
    autoExpansionFor(this.assets.hierarchy(), this.tree.filter(), this.tree.filtered())
  );

  /**
   * The container asked for `expandAll`, and the store can honour it.
   *
   * In `high-volume` mode it cannot: "open everything" over lazily loaded branches would fan out
   * an unbounded number of requests the moment the tree renders. The overlay's config asks for it
   * by default, so this has to be resolved here rather than at the call sites.
   */
  protected readonly effectiveExpandAll = computed(
    () => this.config().expandAll && !this.assets.highVolume()
  );

  protected readonly rows = computed<AssetTreeRow[]>(() =>
    flatten({
      hierarchy: this.assets.hierarchy(),
      expansion: this.tree.expansion(),
      autoExpanded: this.autoExpanded(),
      filter: this.tree.filter(),
      defaultOpen: this.effectiveExpandAll(),
      currentId: this.currentAssetId(),
      // One search per (fleet, filter) for the whole app — see `AssetTreeService.filtered`.
      filtered: this.tree.filtered(),
    })
  );

  /**
   * Nothing matched literally and the fuzzy pass took over, so the row list is "names like
   * what you typed" rather than "names containing it" — which the UI has to admit to.
   */
  protected readonly fuzzyMatch = computed(() => this.tree.filtered()?.fuzzy === true);

  protected readonly loading = computed(() => this.assets.loading() && !this.assets.hierarchy());
  protected readonly error = this.assets.error;
  protected readonly selectedId = this.tree.selectedId;
  protected readonly focusedId = this.tree.focusedId;
  protected readonly filtering = this.tree.filtering;

  /**
   * What the counts count: assets when the Digital Twin Manager is available, devices otherwise
   * (`countUnitFor`). Footer, branch badges and the branch detail rows share this one choice.
   */
  protected readonly countUnit = computed<CountUnit>(() =>
    countUnitFor(this.definitions.available())
  );

  /** Footer: what the user can trust is complete (§3.4). */
  protected readonly summary = computed(() => {
    const rows = this.rows();
    const roots = this.assets.rootIds();
    const unit = this.countUnit();
    let count = 0;
    let devices = 0;
    let unavailable = 0;
    let alarmed = 0;
    let alarms = 0;
    let criticals = 0;

    for (const rootId of roots) {
      const rollup = this.assets.rollupOf(rootId);

      count += unitCount(rollup, unit);
      devices += rollup.deviceCount;
      unavailable += rollup.unavailableCount;
      // Units, to match `count` next to it — not `alarms.critical + alarms.major`, a count of
      // *alarms*, which reported every unit as alarmed whenever there were as many alarms.
      alarmed += alarmedUnitCount(rollup, unit);
      alarms += rollup.alarms.critical + rollup.alarms.major;
      criticals += rollup.alarms.critical;
    }
    // The stat counts units alarmed critical *or* major, so its dot has to say which.
    const worst: DotSeverity = criticals > 0 ? 'critical' : 'major';
    // In `high-volume` mode these are counts over the *loaded* branches, not the fleet. The footer
    // says so rather than presenting a floor as a total.
    const partial = this.assets.highVolume();
    return {
      visible: rows.length,
      unit,
      count,
      devices,
      unavailable,
      alarmed,
      alarms,
      worst,
      partial,
    };
  });

  /** `high-volume` mode is on and the tree is showing part of the fleet — surfaced in the footer. */
  protected readonly highVolume = this.assets.highVolume;
  /** Assets held right now, which is the only fleet number this mode can state. */
  protected readonly loadedCount = this.assets.size;

  protected readonly cascadeTarget = this.cascade.target;
  protected readonly configPanelOpen = this.cascade.configPanelOpen;
  /** The open target when it is a detail panel, narrowed for the template. */
  protected readonly detailTarget = computed(() => {
    const target = this.cascade.target();
    return target?.kind === 'detail' ? target : null;
  });

  protected readonly panelLeft = computed(() => {
    const explicit = this.cascadeFromLeft();

    if (explicit) return explicit;
    const host = this.cascadeHost()?.nativeElement;
    return host ? host.getBoundingClientRect().width : 0;
  });

  protected readonly configPanelLeft = computed(() => this.panelLeft() + DETAIL_PANEL_WIDTH);
  protected readonly detailPanelWidth = DETAIL_PANEL_WIDTH;
  protected readonly detailPanelHeight = DETAIL_PANEL_HEIGHT;
  protected readonly configPanelWidth = CONFIG_PANEL_WIDTH;
  protected readonly quickAccessPanelWidth = QUICK_ACCESS_PANEL_WIDTH;
  protected readonly quickAccessPanelHeight = QUICK_ACCESS_PANEL_HEIGHT;

  /**
   * The context store is used directly rather than through `injectAiContextReporter`,
   * because the id comes from an `input()` and inputs are not readable in a field
   * initializer — a reporter created there would capture the default id, which is the very
   * collision `contextId` exists to prevent. Registration therefore happens on the first
   * `reportContext()`, by which point inputs are set.
   */
  private readonly aiContextService = inject(AiContextService);
  private reportedContextId: string | null = null;

  /**
   * Every branch in the **whole hierarchy**, not just the rows on screen: "expand all" has to
   * open branches that are currently hidden inside a collapsed ancestor, or one click would
   * leave the tree half open and the button still enabled.
   */
  private readonly branchIds = computed(() => {
    const hierarchy = this.assets.hierarchy();

    if (!hierarchy) return [] as string[];
    const ids: string[] = [];

    for (const node of hierarchy.byId.values()) {
      if (node.childIds.length) ids.push(node.id);
    }

    return ids;
  });

  /**
   * Enabled only when there is something to do, judged on the **visible** rows: a button that
   * stays enabled after its own click, because of a branch nobody can see, reads as broken.
   *
   * Both are off while a filter is active. Filtering derives expansion of its own
   * (`autoExpanded` forces every match's ancestors open, §3.5), so collapse-all could not take
   * effect and would sit there enabled and inert — and expand-all would fight the filter for
   * ownership of the same shape.
   */
  protected readonly canExpandAll = computed(
    () =>
      !this.filtering() &&
      !this.assets.highVolume() &&
      this.rows().some((row) => row.hasChildren && !row.expanded)
  );

  protected readonly canCollapseAll = computed(
    () => !this.filtering() && this.rows().some((row) => row.hasChildren && row.expanded)
  );

  constructor() {
    // High-volume mode: whatever opened a branch, an open branch has to have its children.
    effect(() => {
      if (!this.assets.highVolume()) return;
      const pending = branchesToLoad(this.rows(), this.assets.branchStatus());

      untracked(() => pending.forEach((id) => void this.assets.loadChildren(id)));
    });

    // Publish "you are here" to the shared state: the search ranks assets near where the
    // app already is above equally-scored strangers, and the service cannot read the route
    // itself.
    effect(() => this.tree.setCurrentAssetId(this.currentAssetId()));

    // Cascade is a drawer-only affordance; switching a container to `off` must close
    // anything already open rather than leave it orphaned (§4.3, AC-T8).
    effect(() => {
      if (this.config().cascade === 'off' || this.cascadeSuppressed()) this.cascade.close();
    });

    // Latch the reveal off once it can no longer be running. One timer per container
    // instance, armed by the first render that actually has rows.
    effect((onCleanup) => {
      if (!this.revealing()) return;
      const timer = setTimeout(() => this.revealDone.set(true), REVEAL_TOTAL_MS);

      onCleanup(() => clearTimeout(timer));
    });

    // Scroll "you are here" into view, and open the branches leading to it in containers
    // that are not already fully expanded. Without this the highlight is real but off
    // screen, which is the same as not having it.
    //
    // Acts **once per asset**, not once per hierarchy. The effect still depends on the
    // hierarchy — it has to, or an asset the first sweep had not delivered yet would
    // never be revealed — but every poll installs a fresh `AssetHierarchy` object, so
    // without the `revealedId` latch this would re-open branches the user had just
    // collapsed and smooth-scroll the viewport away from wherever they scrolled, every
    // 30 seconds, for as long as the container stays open.
    effect(() => {
      const currentId = this.currentAssetId();

      if (!this.assets.hierarchy() || (currentId && currentId === this.revealedId)) return;

      if (!currentId) {
        // Nothing to be "at" — the user opened the drawer from a page that is not an
        // asset. Opening the root level is the closest thing to the path shape, and beats
        // a panel showing one collapsed row.
        if (!this.effectiveExpandAll() && !this.revealedRoots) {
          this.revealedRoots = true;
          this.tree.revealWithChildren(
            this.assets.rootIds().map((id) => ({ id })),
            { replace: true }
          );
        }

        return;
      }

      const path = this.assets.pathOf(currentId);

      // The asset is not in the cached fleet (yet, or at all) — there is nothing to
      // reveal, and `revealedId` stays unset so a later sweep gets another go.
      if (!path.length) {
        // In `high-volume` mode "not cached" is the normal case for a deep link: nobody has
        // expanded that branch. Fetch the chain to it; this effect re-runs when the resulting
        // hierarchy lands, and `revealedId` is still unset so that run does the revealing.
        // Guarded by `requestedReveal` so a branch that genuinely cannot be resolved is asked for
        // once per asset rather than on every poll.
        if (this.assets.highVolume() && this.requestedReveal !== currentId) {
          this.requestedReveal = currentId;
          void this.assets.ensureLoaded(currentId);
        }

        return;
      }
      const first = this.revealedId === null;

      this.revealedId = currentId;
      // Ancestors *and* the asset itself, so its own children are on screen — but nothing
      // below them. See `AssetTreeService.revealWithChildren` for the `replace` rule.
      if (!this.effectiveExpandAll()) this.tree.revealWithChildren(path, { replace: first });
      // After the rows for the newly opened branches exist.
      afterNextRender(() => this.scrollTo(currentId), { injector: this.injector });
    });

    // Focus-on-open (`autoFocus`). Runs on the first render that actually has rows, not on
    // construction: the hierarchy arrives from the store's sweep, so at construction there
    // is nothing to focus and a one-shot in the constructor would silently do nothing on a
    // cold cache. The `focusTaken` latch is a plain field for the same reason `revealedId`
    // is — every poll installs a fresh hierarchy, and re-focusing on each of those would
    // yank the user back to "you are here" every 30 seconds.
    effect(() => {
      if (!this.autoFocus() || this.focusTaken) return;
      const rows = this.rows();

      if (!rows.length) return;
      const currentId = this.currentAssetId();
      const target = rows.find((row) => row.node.id === currentId) ?? rows[0];

      this.focusTaken = true;
      // Select as well as focus: the drawer's sticky path header renders from the
      // selection, so focusing without selecting would open with an empty path over a
      // tree that clearly is somewhere.
      this.tree.select(target.node.id);
      this.tree.focus(target.node.id);
      // DOM focus goes to the viewport, which is what carries `aria-activedescendant` and
      // the keydown handler. `preventScroll` leaves the scroll position to the reveal
      // effect, which is scrolling to the same row with headroom.
      afterNextRender(
        () => this.viewport()?.elementRef.nativeElement.focus({ preventScroll: true }),
        { injector: this.injector }
      );
    });

    effect(() => this.reportContext());

    inject(DestroyRef).onDestroy(() => {
      if (this.reportedContextId) this.releaseContext(this.reportedContextId);
    });
  }

  /**
   * Whether the "search the whole tenant" way out can be offered — i.e. whether the global-search
   * plugin is installed on this tenant. Hidden rather than broken when it is not.
   */
  protected canHandOverToGlobalSearch(): boolean {
    return globalSearchAvailable();
  }

  /**
   * Hands the term the drawer could not match to the global search, which queries the platform
   * rather than the loaded set. Carrying the term over is the point: retyping it is exactly the
   * friction that makes people give up on the feature.
   */
  protected handOverToGlobalSearch(): void {
    openGlobalSearch({ term: this.tree.searchText() });
  }

  // ── row interaction ──────────────────────────────────────────────────────────

  protected onPick(row: AssetTreeRow): void {
    this.tree.select(row.node.id);
    this.tree.focus(row.node.id);
    // Keyboard focus lives on the viewport (`aria-activedescendant`, not a roving
    // tabindex), so after a click it has to be put there explicitly — otherwise the arrow
    // keys go to whatever was focused before and traversal cannot be picked up by keyboard
    // where the pointer left off. `preventScroll` because the browser would otherwise
    // scroll the viewport to wherever DOM focus notionally is.
    this.viewport()?.elementRef.nativeElement.focus({ preventScroll: true });
    this.select.emit(row.node);
    // A branch row does both: it toggles *and* it routes. The same call the twisty makes, so
    // clicking the row body and clicking the twisty can never disagree about the branch.
    if (row.hasChildren) this.tree.setOpen(row.node.id, !row.expanded);
    // One click routes, in every container, and the container stays open (§3.1). Traversal is
    // then one gesture per level instead of a select plus a separate open, and nothing
    // disappears afterwards — the drawer/overlay closes only on Esc, backdrop or its button.
    this.emitActivate(row.node, false);
  }

  protected onActivate(row: AssetTreeRow, newTab: boolean): void {
    this.tree.select(row.node.id);
    this.tree.focus(row.node.id);
    this.emitActivate(row.node, newTab);
  }

  protected onToggle(row: AssetTreeRow): void {
    // `row.expanded` is the visual state, which is what the user is acting on — recording
    // its opposite is correct whatever this container defaults to.
    const opening = !row.expanded;

    this.tree.setOpen(row.node.id, opening);
    // In `high-volume` mode opening a branch is also what fetches it. Idempotent and deduped in
    // the store, so a double-click costs one request, and a no-op in `full` mode.
    if (opening) void this.assets.loadChildren(row.node.id);
  }

  /** The explicit "load more" past the auto-loaded page budget (§high-volume). */
  protected onLoadMore(row: AssetTreeRow): void {
    void this.assets.loadMoreChildren(row.node.id);
  }

  /** Whether the row's asset is pinned (a platform bookmark) — drives the row's star. */
  protected isPinned(row: AssetTreeRow): boolean {
    return this.tree.isPinned(row.node.id);
  }

  /** Per-branch load state, so a row can show a spinner or an error rather than looking empty. */
  protected branchStatusOf(row: AssetTreeRow): BranchStatus | undefined {
    return this.assets.branchStatus().get(row.node.id);
  }

  /** How many children of this branch exist but are not held. 0 hides the "load more" row. */
  protected missingChildrenOf(row: AssetTreeRow): number {
    return this.assets.missingChildren(row.node.id);
  }

  // ── expand / collapse all ────────────────────────────────────────────────────

  protected expandAllBranches(): void {
    this.tree.setAllOpen(this.branchIds(), true);
  }

  protected collapseAllBranches(): void {
    this.tree.setAllOpen(this.branchIds(), false);
  }

  /**
   * **Hover *is* selection.** Pointing at a row moves both the selection and the keyboard
   * cursor onto it, so an arrow press continues from where the pointer is rather than from
   * wherever the last click was — the pointer and the keyboard drive one cursor, not two.
   *
   * That needs DOM focus on the viewport (it owns `aria-activedescendant` and the keydown
   * handler), but taking it unconditionally would pull the caret out of the container's
   * filter field the moment the pointer crossed the tree — including mid-word, since the
   * tree's own type-ahead sends keystrokes there. So any text entry keeps focus.
   *
   * Never scrolls: `moveFocus` would `scrollToIndex` and slide a different row under the
   * stationary pointer, which re-enters here and walks the cursor on its own.
   */
  protected onRowEnter(row: AssetTreeRow, event: MouseEvent): void {
    this.tree.select(row.node.id);
    this.tree.focus(row.node.id);

    const active = document.activeElement;
    const typing =
      active instanceof HTMLElement &&
      (active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active.isContentEditable);

    if (!typing) this.viewport()?.elementRef.nativeElement.focus({ preventScroll: true });

    if (this.config().cascade !== 'right-edge') return;
    const anchorTop = (event.currentTarget as HTMLElement).getBoundingClientRect().top;

    this.cascade.enter({ kind: 'detail', id: row.node.id, anchorTop });
  }

  protected onRowLeave(): void {
    this.cascade.leave();
  }

  /** The explicit ⓘ affordance and the touch long-press both land here (§6.5). */
  protected onShowDetail(row: AssetTreeRow): void {
    if (this.config().cascade !== 'right-edge') return;
    const anchorTop = this.rowElement(row.node.id)?.getBoundingClientRect().top ?? 0;

    this.cascade.openNow({ kind: 'detail', id: row.node.id, anchorTop });
  }

  /**
   * The header row's twisty / Enter / ArrowRight / Escape. Opens and closes the
   * quick-access cascade panel — `openNow`, not `enter`: a click or a key is committed
   * intent, there is no hover delay to pay.
   */
  protected onQuickAccessToggle(): void {
    if (this.config().cascade !== 'right-edge') return;

    if (this.quickAccessOpen()) {
      this.cascade.close();

      return;
    }
    this.cascade.openNow({ kind: 'quick-access', anchorTop: this.quickAccessAnchorTop() });
  }

  /** Hover intent on the header row — same delay and grace as a hierarchy row's panel. */
  protected onQuickAccessEnter(event: MouseEvent): void {
    if (this.config().cascade !== 'right-edge') return;
    const anchorTop = (event.currentTarget as HTMLElement).getBoundingClientRect().top;

    this.cascade.enter({ kind: 'quick-access', anchorTop });
  }

  protected onQuickAccessLeave(): void {
    this.cascade.leave();
  }

  /**
   * Escape bubbling out of the quick-access region — the row already closed its own panel
   * (and stopped the event) if one was open, so reaching here means "close the container",
   * exactly as the hierarchy viewport's Escape does.
   */
  protected onQuickAccessEscape(): void {
    if (!this.cascade.closeInnermost()) this.requestClose.emit();
  }

  /**
   * Arrow-down off the last Pinned/Recent entry: the hierarchy takes over. Focus goes to
   * the viewport (which owns `aria-activedescendant`) and lands on the first row, so the
   * two sections read as one vertical run.
   */
  protected focusHierarchy(): void {
    const rows = this.rows();

    if (!rows.length) return;
    this.viewport()?.elementRef.nativeElement.focus({ preventScroll: true });
    this.moveFocus(rows, 0);
  }

  protected async onQuickAccessPicked(item: QuickAccessItem): Promise<void> {
    // In `high-volume` mode a pinned or recently visited asset is very often *not* loaded — its
    // branch was never expanded in this session. Load the chain down to it before revealing;
    // a no-op in `full` mode, where the sweep already holds it.
    const node = (await this.assets.ensureLoaded(item.assetId)) ?? this.assets.node(item.assetId);

    if (!node) return;

    // "Clicking one selects and reveals it in the tree" (AC-T7).
    // In `expandAll` mode the ancestors are already open and `reveal()` — which *adds* to
    // the set — would collapse them instead.
    if (!this.effectiveExpandAll()) {
      this.tree.revealWithChildren(this.assets.pathOf(item.assetId));
    }
    this.tree.select(item.assetId);
    this.tree.focus(item.assetId);
    this.scrollTo(item.assetId);
    this.select.emit(node);
    // Routes, like a click in the hierarchy — the two lists are one vertical run and must not
    // answer a click differently.
    this.emitActivate(node, false);
  }

  /**
   * Double-click / Enter on a Pinned or Recent entry opens the asset's page, in every
   * container. Reveal first, so the tree behind is left on that asset rather than wherever
   * the user was.
   */
  protected async onQuickAccessActivated(event: {
    item: QuickAccessItem;
    newTab: boolean;
  }): Promise<void> {
    const node =
      (await this.assets.ensureLoaded(event.item.assetId)) ?? this.assets.node(event.item.assetId);

    if (!node) return;

    if (!this.effectiveExpandAll()) {
      this.tree.revealWithChildren(this.assets.pathOf(event.item.assetId));
    }
    this.tree.select(event.item.assetId);
    this.tree.focus(event.item.assetId);
    this.scrollTo(event.item.assetId);
    this.emitActivate(node, event.newTab);
  }

  protected async onPinToggled(assetId: string): Promise<void> {
    const node = this.assets.node(assetId);

    if (!node) return;

    try {
      await this.tree.togglePin({ assetId, label: node.name });
    } catch {
      // The pin is a platform bookmark: the user preferences write can fail (permissions,
      // network), and the star would otherwise just not move.
      this.alerts.danger(gettext('Could not update the pinned assets.'));
    }
  }

  /**
   * The detail panel's `Open` and `Alarms` actions. `view` carries which tab of the asset's
   * page was asked for — the tree does not know the routes, only that the user asked for
   * alarms rather than the default view.
   */
  protected onDetailOpen(assetId: string, newTab: boolean, view?: AssetActivation['view']): void {
    const node = this.assets.node(assetId);

    if (node) this.emitActivate(node, newTab, view);
  }

  protected onCascadeHold(): void {
    this.cascade.hold();
  }

  protected onCascadeRelease(): void {
    this.cascade.leave();
  }

  /** The type the ⚙ editor configures: the hovered asset's (`null`, the default list, if gone). */
  protected assetTypeOf(id: string): string | null {
    return this.assets.node(id)?.type ?? null;
  }

  protected openConfigPanel(): void {
    this.cascade.openConfigPanel();
  }

  protected closeConfigPanel(): void {
    this.cascade.closeInnermost();
  }

  /**
   * The field-config panel opened or closed a modal. The cascade has to stay pinned for
   * that whole time — reaching the modal means leaving the panel, and the resulting close
   * would destroy the component waiting for the modal's result.
   */
  protected onConfigModal(open: boolean): void {
    this.cascade.setLocked(open);
  }

  // ── keyboard (§3.6) ──────────────────────────────────────────────────────────

  protected onKeydown(event: KeyboardEvent): void {
    const rows = this.rows();
    const index = rows.findIndex((row) => row.node.id === this.focusedId());
    const current = index >= 0 ? rows[index] : undefined;

    // Nothing focused yet — the tree was reached by Tab, or the focused row was filtered
    // away. Every navigation key then means "start at the top", so the first arrow press
    // does something visible instead of being swallowed.
    if (
      !current &&
      ['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Enter'].includes(event.key)
    ) {
      this.moveFocus(rows, event.key === 'ArrowUp' ? rows.length - 1 : 0);
      event.preventDefault();

      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        this.moveFocus(rows, index + 1);
        break;
      case 'ArrowUp':
        // Off the top row, focus leaves the hierarchy for the Pinned & Recent section
        // above it rather than stopping dead — the mirror of that section's `exitDown`.
        if (index === 0) this.quickAccess()?.focusRegion();
        else this.moveFocus(rows, index - 1);
        break;
      case 'ArrowRight':
        if (!current) return;
        // Closed branch → open it. Open branch → step into its first child (which is the
        // next visible row, since `flatten` emits depth-first). Leaf → nothing; there is
        // no level to descend into and moving down instead would break the invariant that
        // Right only ever goes deeper (WAI-ARIA `tree` pattern).
        if (current.hasChildren && !current.expanded) this.tree.setOpen(current.node.id, true);
        else if (current.hasChildren && current.expanded) this.moveFocus(rows, index + 1);
        break;
      case 'ArrowLeft':
        if (!current) return;

        // Open branch → close it. Anything else (closed branch or leaf) → step out to the
        // parent row, so repeated Left walks up the hierarchy one level per press.
        if (current.hasChildren && current.expanded) this.tree.setOpen(current.node.id, false);
        else if (current.node.parentId) {
          const parentIndex = rows.findIndex((row) => row.node.id === current.node.parentId);

          if (parentIndex >= 0) this.moveFocus(rows, parentIndex);
        }
        break;
      case 'Enter':
        // Enter is the *only* keyboard open — arrows and Space never navigate, so arrowing
        // through the tree stays free of page loads while the pointer side routes on click.
        // A modifier opens in a new tab, as ⌘/Ctrl-click does.
        if (current) this.onActivate(current, event.altKey || event.metaKey || event.ctrlKey);
        break;
      case 'Home':
        this.moveFocus(rows, 0);
        break;
      case 'End':
        this.moveFocus(rows, rows.length - 1);
        break;
      case 'Escape':
        // The innermost cascade level first; only then does Esc mean "close me" (§3.6).
        if (!this.cascade.closeInnermost()) this.requestClose.emit();
        break;
      default:
        // Type-ahead: printable characters belong in the filter input, which the
        // container owns. Modified keys are left to the browser.
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          this.filterTyped.emit(event.key);
          break;
        }

        return;
    }
    event.preventDefault();
  }

  protected rowId(row: AssetTreeRow): string {
    return `ps-tree-row-${row.node.id}`;
  }

  /** Per-level stagger, capped so a deep hierarchy does not keep the user waiting. */
  protected revealDelay(depth: number): number {
    return Math.min(depth, REVEAL_MAX_LEVELS) * REVEAL_STEP_MS;
  }

  protected trackRow(_index: number, row: AssetTreeRow): string {
    return row.node.id;
  }

  // ── private helpers (quick access, keyboard focus, AI context) ───────────────

  private quickAccessAnchorTop(): number {
    return this.quickSection()?.nativeElement.getBoundingClientRect().top ?? 0;
  }

  private moveFocus(rows: readonly AssetTreeRow[], index: number): void {
    if (!rows.length) return;
    const clamped = Math.max(0, Math.min(index, rows.length - 1));
    const row = rows[clamped];

    this.tree.focus(row.node.id);
    this.viewport()?.scrollToIndex(clamped, 'smooth');

    // "Focusing a row **must** open the detail panel" — hover is not the only trigger
    // (§3.6, AC-T9). The anchor is resolved after the scroll settles.
    if (this.config().cascade === 'right-edge') {
      requestAnimationFrame(() => {
        const element = this.rowElement(row.node.id);

        this.cascade.openNow({
          kind: 'detail',
          id: row.node.id,
          anchorTop: element?.getBoundingClientRect().top ?? 0,
        });
      });
    }
  }

  /**
   * Brings a row into view **only when it is not already in it.** Scrolling a row the user
   * can already see moves the rest of the tree out from under them for no gain, and the
   * reveal effect re-runs on every navigation — so the common case (clicking a turbine
   * that is on screen) must not jump.
   *
   * When it does scroll it leaves a couple of rows of headroom above the target, so the
   * row lands with its parent visible instead of flush against the top edge, where it
   * reads as the root of the tree rather than as a leaf of something.
   */
  private scrollTo(assetId: string): void {
    const index = this.rows().findIndex((row) => row.node.id === assetId);

    if (index < 0) return;
    const viewport = this.viewport();

    if (!viewport) return;

    const rowHeight = this.rowHeight();
    const top = index * rowHeight;
    const scrollOffset = viewport.measureScrollOffset();
    // 0 before the first measurement (the viewport has not been laid out yet), which fails
    // the containment test below and scrolls — the right way round: the row cannot be
    // visible in a viewport that has no height.
    const viewportSize = viewport.getViewportSize();

    if (top >= scrollOffset && top + rowHeight <= scrollOffset + viewportSize) return;

    viewport.scrollToIndex(Math.max(0, index - SCROLL_HEADROOM_ROWS), 'smooth');
  }

  private rowElement(assetId: string): HTMLElement | null {
    const viewport = this.viewport();

    if (!viewport) return null;

    return viewport.elementRef.nativeElement.querySelector<HTMLElement>(
      `[data-asset-id="${assetId}"]`
    );
  }

  private emitActivate(node: AssetNode, newTab: boolean, view?: AssetActivation['view']): void {
    void this.tree.touchRecent({ assetId: node.id, label: node.name });
    this.activate.emit({ node, newTab, view });
  }

  /**
   * What a screen reader would convey about the rendered tree — resolved labels, dot
   * colours in words, the selected node and its path, loading/empty states. Not a dump
   * of the hierarchy (`docs/ContextAwareAIChat/ui-to-ai-context.spec.md`).
   */
  private reportContext(): void {
    const summary = this.summary();
    const filter = this.tree.filter();
    const selectedId = this.selectedId();
    const selected = selectedId ? this.assets.node(selectedId) : undefined;

    // Bind (or rebind) this instance's entry to the id the container asked for, and hang the
    // pull-refresh handler off the same id so the two can never drift apart.
    const contextId = this.contextId();

    if (this.reportedContextId !== contextId) {
      if (this.reportedContextId) this.releaseContext(this.reportedContextId);
      this.aiContextService.onRefresh(contextId, () => this.reportContext());
      this.reportedContextId = contextId;
    }

    this.aiContextService.report(contextId, {
      name: gettext('Asset tree'),
      contextData: {
        state: this.loading() ? 'loading' : this.error() ? 'error' : 'ready',
        visibleRows: summary.visible,
        // Labelled `loaded…` and carrying `coverage` in `high-volume` mode, because these are
        // counts over the branches that happen to be in memory. Reporting them as fleet totals
        // would have the assistant assert "the fleet has 12 devices" about a 700k tenant.
        fleet: {
          coverage: summary.partial ? 'partial — only loaded branches are counted' : 'complete',
          [summary.unit]: summary.count,
          unavailableDevices: summary.unavailable,
          [`${summary.unit}WithCriticalOrMajorAlarms`]: summary.alarmed,
          activeCriticalOrMajorAlarms: summary.alarms,
          ...(summary.partial ? { assetsLoaded: this.loadedCount() } : {}),
        },
        filter: {
          searchText: filter.searchText || null,
          matchMode: filter.matchMode,
          assetTypes: filter.assetTypes.length ? [...filter.assetTypes] : null,
          restrictedTo: filter.scope ? this.assets.pathLabel(filter.scope) : null,
        },
        // Where the app already is, as distinct from what is selected in the tree.
        currentLocation: (() => {
          const currentId = this.currentAssetId();

          if (!currentId) return null;
          const current = this.assets.node(currentId);
          return current
            ? { name: current.name, type: current.type, path: this.assets.pathLabel(currentId) }
            : 'an asset that is not in the tree';
        })(),
        fullyExpanded: this.effectiveExpandAll(),
        selected: selected
          ? {
              name: selected.name,
              type: selected.type,
              path: this.assets.pathLabel(selected.id),
              status: effectiveAvailability(selected, this.assets.rollupOf(selected.id)),
              alarms: this.assets.rollupOf(selected.id).worst ?? 'none',
            }
          : null,
        // The rows actually on screen, described the way the dots read.
        visible: cappedList(
          this.rows().map((row) => ({
            name: row.node.name,
            type: row.node.type,
            depth: row.depth,
            expanded: row.expanded,
            worstAlarm: row.rollup.worst ?? 'none',
            [this.countUnit()]: unitCount(row.rollup, this.countUnit()) || undefined,
            unavailableDevices: row.rollup.unavailableCount || undefined,
            // Marked "Current" on screen, so it has to be marked here too.
            youAreHere: row.current || undefined,
          })),
          25
        ),
        asOf: this.assets.asOf(),
      },
      metaData: {
        widgetType: 'ps.asset-tree',
        density: this.config().density,
        cascade: this.config().cascade,
      },
    });
  }

  /**
   * Retracts the entry **and** unregisters its pull handler. Both matter: a handler left
   * behind would be invoked on the next `requestRefresh()` and would re-report from a
   * destroyed component, resurrecting an entry that was just removed.
   */
  private releaseContext(contextId: string): void {
    this.aiContextService.offRefresh(contextId);
    this.aiContextService.remove(contextId);
  }
}
