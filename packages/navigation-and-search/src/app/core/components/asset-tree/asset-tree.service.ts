import {
  Injectable,
  type Signal,
  type WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { UserPreferencesService } from '@c8y/ngx-components';
import { firstValueFrom } from 'rxjs';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import {
  EMPTY_TREE_FILTER,
  filterHierarchy,
  type FilteredHierarchy,
  type TreeFilter,
} from './asset-tree.model';
import type { AssetHierarchy } from '../../services/asset-store/asset-store.model';
import { LIST_LIMIT } from '../../services/settings/navigator-settings.model';
import { NavigatorSettingsService } from '../../services/settings/navigator-settings.service';
import { applyTreeFilter } from '../../services/settings/tree-filter.model';

/**
 * Tree state: expansion, selection, filter, pinned & recent assets (tree design §3, §6.1).
 * The detail panel's fields are not here: they are part of the navigator settings
 * (`NavigatorSettings.detailPanel`).
 *
 * Everything here is parked on `globalThis` for the same reason as `AssetStoreService`
 * — the drawer and the overlay are separate plugin bundles, each with its own compiled
 * copy of this class, and they must share one state. That sharing is a stated
 * acceptance criterion: expand in the drawer, close it, press `⌘K`, and the overlay
 * shows the same shape and selection (AC-T3).
 *
 * v2: `expanded: Set<string>` became `expansion: Map<string, boolean>` — see
 * {@link AssetTreeService.expansion}. v3: the detail panel's field list became per type.
 * v4 adds {@link AssetTreeService.currentAssetId}. v5 drops the detail-field state (moved to
 * the navigator settings). No pair is interchangeable, so the key is versioned: a stale
 * bundle and a current one must not share a slot.
 */
const STATE_SYMBOL = Symbol.for('c8y-ps.asset-tree-state.v5');

/** Per-user preference keys. `bookmarks` is the platform's own — see `pinned`. */
const PREF_BOOKMARKS = 'bookmarks';
const PREF_RECENT = 'ps.assetNav.recent';

/** Recents kept per user: the settings drawer's upper limit, so any configured display size has entries. */
const MAX_RECENT = LIST_LIMIT.max;

/**
 * A platform bookmark, as `@c8y/ngx-components/bookmarks` stores it under the
 * `bookmarks` user preference. Retyped here rather than imported: that entry point
 * exports only components and the module, not `Bookmark`/`BookmarkService`, and a deep
 * import into its internals would be a private-API dependency.
 */
export interface PlatformBookmark {
  id: string;
  label: string;
  url: string;
  icon?: string;
  markToRemove?: boolean;
}

/** A pinned or recent asset as the quick-access panel shows it. */
export interface QuickAccessEntry {
  assetId: string;
  /** The label as stored — used when the asset is no longer in the store. */
  label: string;
  icon?: string;
}

interface AssetTreeState {
  expansion: WritableSignal<ReadonlyMap<string, boolean>>;
  selectedId: WritableSignal<string | null>;
  focusedId: WritableSignal<string | null>;
  filter: WritableSignal<TreeFilter>;
  pinned: WritableSignal<readonly QuickAccessEntry[]>;
  recent: WritableSignal<readonly QuickAccessEntry[]>;
  /** Where the surrounding app already is — a ranking signal, not a selection. */
  currentAssetId: WritableSignal<string | null>;
  /** Guards the one-time preference read across bundles. */
  prefsLoaded: boolean;
}

type GlobalWithState = typeof globalThis & { [STATE_SYMBOL]?: AssetTreeState };

function resolveState(): AssetTreeState {
  const scope = globalThis as GlobalWithState;
  return (scope[STATE_SYMBOL] ??= {
    expansion: signal<ReadonlyMap<string, boolean>>(new Map()),
    selectedId: signal<string | null>(null),
    focusedId: signal<string | null>(null),
    filter: signal<TreeFilter>({ ...EMPTY_TREE_FILTER }),
    pinned: signal<readonly QuickAccessEntry[]>([]),
    recent: signal<readonly QuickAccessEntry[]>([]),
    currentAssetId: signal<string | null>(null),
    prefsLoaded: false,
  });
}

/**
 * A pin, written in the platform's own bookmark form — `${pathname}#${route}` — so it
 * lands in the right-hand drawer's list as a working link.
 *
 * Every asset carries `c8y_IsAsset` + `c8y_IsDeviceGroup`, so the group context
 * route is right for all of them; a pure device (a gateway, a sensor) uses the
 * device route. `AssetNavigationService.routeFor` decides which, and the route shapes
 * here have to stay in step with `ViewContext.Group` / `.Device`.
 */
export function assetBookmarkUrl(assetId: string, isPureDevice = false): string {
  const path = typeof location === 'undefined' ? '' : location.pathname;
  return `${path}#/${isPureDevice ? 'device' : 'group'}/${assetId}`;
}

/** The asset id inside a bookmark url, or `null` when it does not point at one. */
export function assetIdFromBookmarkUrl(url: string): string | null {
  const match = /#\/(?:group|device)\/([^/?#]+)/.exec(url);
  return match ? match[1] : null;
}

@Injectable({ providedIn: 'root' })
export class AssetTreeService {
  private readonly state = resolveState();
  private readonly preferences = inject(UserPreferencesService);
  private readonly assets = inject(AssetStoreService);
  private readonly settings = inject(NavigatorSettingsService);

  /**
   * The branches the user has **explicitly** opened or closed — `true` = open, `false` =
   * closed, absent = "whatever this container's default is"
   * (`AssetTreeConfig.expandAll`).
   *
   * A map of overrides rather than a set of open ids, because the two containers disagree
   * about the default: the overlay starts fully expanded, the drawer starts on a path. A
   * set would have to mean "expanded" in one and "collapsed" in the other — and this state
   * is *shared between them* (AC-T3), so expanding a park in the drawer would have
   * collapsed it in the overlay. Overrides are mode-independent: `park → true` reads as
   * open in both, whatever either one defaults to.
   *
   * It also removes the set/visual inversion entirely — everything here now speaks in
   * terms of *open* and *closed*, which is what every caller actually means.
   */
  readonly expansion: Signal<ReadonlyMap<string, boolean>> = this.state.expansion.asReadonly();
  readonly selectedId: Signal<string | null> = this.state.selectedId.asReadonly();
  readonly focusedId: Signal<string | null> = this.state.focusedId.asReadonly();
  readonly filter: Signal<TreeFilter> = this.state.filter.asReadonly();
  readonly pinned: Signal<readonly QuickAccessEntry[]> = this.state.pinned.asReadonly();
  readonly recent: Signal<readonly QuickAccessEntry[]> = this.state.recent.asReadonly();

  /**
   * The search term, which the **containers' inputs render from** rather than keeping a
   * copy of.
   *
   * It lives here for the same reason expansion and selection do: the drawer and the
   * overlay are two views onto one tree state (AC-T3). When each container owned its own
   * term and pushed it in, closing the overlay left its term applied to a tree whose
   * visible input was empty — a filtered, sometimes empty tree with no visible way to
   * clear it — and whichever container mounted second overwrote the other's term with its
   * own initial `''`.
   */
  readonly searchText = computed(() => this.filter().searchText);

  /**
   * The asset the surrounding app is showing. Pushed in by the tree component from its
   * `currentAssetId` input, and used as a ranking signal: things near where you already
   * are beat strangers of equal score.
   */
  readonly currentAssetId: Signal<string | null> = this.state.currentAssetId.asReadonly();

  /**
   * The user's permanent tree filter (settings drawer → Tree filter), applied to the store's
   * hierarchy: `null` while it is off or has no conditions.
   */
  private readonly treeFiltered = computed(() => {
    const hierarchy = this.assets.hierarchy();

    return hierarchy ? applyTreeFilter(hierarchy, this.settings.settings().treeFilter) : null;
  });

  /**
   * **The** hierarchy the tree shows — the store's, narrowed by the permanent tree filter. Every
   * tree reader takes it from here, so rows, search, expand-all and the footer agree. The global
   * search and Pinned & Recent keep using the store's whole fleet.
   */
  readonly hierarchy = computed<AssetHierarchy | null>(
    () => this.treeFiltered()?.hierarchy ?? this.assets.hierarchy()
  );

  /** Assets the permanent tree filter hides; 0 while it is off. */
  readonly hiddenByFilter = computed(() => this.treeFiltered()?.hidden ?? 0);

  /**
   * **The** filter evaluation — one search per (fleet, filter, index), shared by every
   * reader.
   *
   * It is a `computed` and not a function for a reason worth keeping: `filterHierarchy`
   * used to be called four times per keystroke (row list, auto-expansion, the "no exact
   * match" notice, the overlay's results), each running a full pass over the fleet. Signal
   * memoisation collapses that to one, and both containers share it because the whole
   * service is shared.
   */
  readonly filtered = computed<FilteredHierarchy | null>(() => {
    const hierarchy = this.hierarchy();

    if (!hierarchy) return null;

    return filterHierarchy(hierarchy, this.filter(), {
      index: this.assets.searchIndex(),
      context: { pinnedIds: this.pinnedIds(), currentId: this.currentAssetId() },
    });
  });

  /** Matches best-first (`asset-search.ts` ranking) — the overlay's grid order. */
  readonly rankedMatches = computed<readonly string[]>(() => this.filtered()?.order ?? []);

  private readonly pinnedIds = computed(() => new Set(this.pinned().map((entry) => entry.assetId)));

  /** Whether a filter is narrowing the tree — what the "clear" affordance keys off. */
  readonly filtering = computed(() => {
    const filter = this.filter();
    return filter.searchText.trim().length > 0 || filter.assetTypes.length > 0 || !!filter.scope;
  });

  constructor() {
    void this.loadPreferences();
  }

  // ── expansion ────────────────────────────────────────────────────────────────

  /** Whether the user has said anything about this branch, and what. */
  openState(id: string): boolean | undefined {
    return this.expansion().get(id);
  }

  setOpen(id: string, open: boolean): void {
    if (this.expansion().get(id) === open) return;
    this.state.expansion.set(new Map(this.expansion()).set(id, open));
  }

  setAllOpen(ids: Iterable<string>, open: boolean): void {
    const next = new Map(this.expansion());

    for (const id of ids) next.set(id, open);
    this.state.expansion.set(next);
  }

  /**
   * Opens the path to an asset **and the asset itself**, so its own children are visible
   * without a further click — you land on a park and see its turbines, but not every
   * turbine's sub-assets (the drawer's opening shape).
   *
   * `replace` drops every existing override first. The drawer passes it on the first reveal
   * of a freshly opened panel: this state is global and outlives the panel, so without it
   * the "only the path" shape would be polluted by whatever was open the last time —
   * possibly in the other container. Later reveals in the same panel are additive, because
   * by then the expansion is the user's own work and resetting it would be destructive.
   */
  revealWithChildren(path: readonly { id: string }[], options?: { replace?: boolean }): void {
    if (!path.length) return;
    const next = options?.replace ? new Map<string, boolean>() : new Map(this.expansion());

    for (const node of path) next.set(node.id, true);
    this.state.expansion.set(next);
  }

  /** Forgets every override, so every branch falls back to the container's default. */
  resetExpansion(): void {
    if (!this.expansion().size) return;
    this.state.expansion.set(new Map());
  }

  // ── selection & focus ────────────────────────────────────────────────────────

  select(id: string | null): void {
    this.state.selectedId.set(id);
  }

  focus(id: string | null): void {
    this.state.focusedId.set(id);
  }

  /**
   * Records where the app is. Guarded against no-op writes: this feeds the search's
   * ranking context, so an unguarded write would re-run the search on every render pass
   * of every mounted tree.
   */
  setCurrentAssetId(id: string | null): void {
    if (this.state.currentAssetId() !== id) this.state.currentAssetId.set(id);
  }

  // ── filter ───────────────────────────────────────────────────────────────────

  /**
   * Merges `patch` into the filter.
   *
   * Two things here are load-bearing, and stay so for any caller that ever drives this
   * from an `effect()` (the containers now write it straight from their event handlers,
   * which is why they no longer keep a copy of the term — see {@link searchText}):
   *
   * - **`update`, never `set({ ...this.filter() })`.** Reading the signal inside an
   *   effect subscribes that effect to it, so writing it back re-triggers the same
   *   effect — an infinite loop that hard-freezes the tab. `update` reads the raw value
   *   without registering a dependency.
   * - **No-op writes are dropped.** A fresh object literal is never `===` the previous
   *   one, so an unguarded write notifies every reader on each keystroke-shaped
   *   re-evaluation, and two effects patching different keys would ping-pong forever.
   */
  setFilter(patch: Partial<TreeFilter>): void {
    this.state.filter.update((current) => {
      const next = { ...current, ...patch };
      const unchanged =
        next.searchText === current.searchText &&
        next.matchMode === current.matchMode &&
        next.scope === current.scope &&
        next.assetTypes.length === current.assetTypes.length &&
        next.assetTypes.every((type, index) => type === current.assetTypes[index]);
      return unchanged ? current : next;
    });
  }

  clearFilter(): void {
    this.state.filter.update((current) => {
      const empty = { ...EMPTY_TREE_FILTER };
      return current.searchText === empty.searchText &&
        current.matchMode === empty.matchMode &&
        current.scope === empty.scope &&
        current.assetTypes.length === 0
        ? current
        : empty;
    });
  }

  // ── pinned (platform bookmarks) & recent ─────────────────────────────────────

  isPinned(assetId: string): boolean {
    return this.pinned().some((entry) => entry.assetId === assetId);
  }

  /**
   * Pins or unpins an asset **as a platform bookmark**: the same
   * `bookmarks` user preference the right-hand drawer reads, so one list serves both
   * (the user's decision on OQ-T4). The drawer reads its list on init, so an existing
   * drawer shows the change after it is reopened.
   */
  async togglePin(entry: QuickAccessEntry, isPureDevice = false): Promise<void> {
    const bookmarks = await this.readBookmarks();
    const without = bookmarks.filter(
      (bookmark) => assetIdFromBookmarkUrl(bookmark.url) !== entry.assetId
    );
    // Shorter than what we read ⇒ it was pinned, and dropping it is the unpin.
    const next =
      without.length < bookmarks.length
        ? without
        : [
            ...bookmarks,
            {
              id: crypto.randomUUID(),
              label: entry.label,
              url: assetBookmarkUrl(entry.assetId, isPureDevice),
              icon: entry.icon ?? 'c8y-group',
            },
          ];

    await this.preferences.set(PREF_BOOKMARKS, next);
    this.state.pinned.set(projectPinned(next));
  }

  /** Records a visit. Most-recent-first, capped, pinned assets excluded (§6.1). */
  async touchRecent(entry: QuickAccessEntry): Promise<void> {
    const next = [entry, ...this.recent().filter((item) => item.assetId !== entry.assetId)].slice(
      0,
      MAX_RECENT
    );

    this.state.recent.set(next);

    try {
      await this.preferences.set(PREF_RECENT, next);
    } catch {
      // Kept for this session: recents are a convenience, a failed write is no error.
    }
  }

  // ── preferences ──────────────────────────────────────────────────────────────

  private async readBookmarks(): Promise<PlatformBookmark[]> {
    const raw = await firstValueFrom<unknown>(this.preferences.get(PREF_BOOKMARKS));
    return Array.isArray(raw) ? (raw as PlatformBookmark[]) : [];
  }

  /**
   * One read per session, shared across bundles. Failures are swallowed: preferences
   * are a convenience, and an unreadable one must degrade to the defaults rather than
   * keep the tree from rendering.
   */
  private async loadPreferences(): Promise<void> {
    if (this.state.prefsLoaded) return;
    this.state.prefsLoaded = true;

    try {
      const [bookmarks, recent] = await Promise.all([
        this.readBookmarks(),
        firstValueFrom<unknown>(this.preferences.get(PREF_RECENT)),
      ]);

      this.state.pinned.set(projectPinned(bookmarks));
      this.state.recent.set(projectRecent(recent));
    } catch {
      // Defaults are already in place.
    }
  }
}

/** Bookmarks that point at an asset, in stored order. */
function projectPinned(bookmarks: readonly PlatformBookmark[]): QuickAccessEntry[] {
  const entries: QuickAccessEntry[] = [];

  for (const bookmark of bookmarks) {
    if (bookmark.markToRemove) continue;
    const assetId = assetIdFromBookmarkUrl(bookmark.url);

    // A bookmark that points anywhere else (a dashboard, an alarm list) is somebody
    // else's — leave it in the preference untouched and out of the pinned list.
    if (!assetId) continue;
    entries.push({ assetId, label: bookmark.label, icon: bookmark.icon });
  }

  return entries;
}

function projectRecent(raw: unknown): QuickAccessEntry[] {
  if (!Array.isArray(raw)) return [];

  return (raw as unknown[])
    .filter((entry): entry is QuickAccessEntry => {
      const candidate = entry as Partial<QuickAccessEntry> | null;
      return (
        !!candidate && typeof candidate.assetId === 'string' && typeof candidate.label === 'string'
      );
    })
    .slice(0, MAX_RECENT);
}
