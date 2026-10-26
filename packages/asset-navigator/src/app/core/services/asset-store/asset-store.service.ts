import {
  DestroyRef,
  type EnvironmentProviders,
  Injectable,
  type Signal,
  type WritableSignal,
  computed,
  inject,
  isDevMode,
  makeEnvironmentProviders,
  provideEnvironmentInitializer,
  signal,
} from '@angular/core';
import { IdentityService, InventoryService } from '@c8y/client';
import { buildAssetIndex, type AssetSearchIndex } from './asset-search';
import { buildHierarchy, pathOf, type RawManagedObject } from './asset-rollup';
import {
  ancestorChainToLoaded,
  isBranchStale,
  mergeLoadedAssets,
  missingChildCount,
  type BranchCacheEntry,
} from './asset-graft';
import { AssetDefinitionService } from './asset-definition.service';
import {
  DEFAULT_ASSET_STORE_CONFIG,
  EMPTY_ROLLUP,
  FLEET_ROOT_EXTERNAL_ID,
  FLEET_ROOT_EXTERNAL_ID_TYPE,
  type AssetHierarchy,
  type AssetNode,
  type AssetRollup,
  type AssetStoreConfig,
  type AssetStoreMode,
  type BranchStatus,
} from './asset-store.model';

/** Platform cap on `pageSize` for `GET /inventory/managedObjects`. */
const PAGE_SIZE = 2000;
/** 50k-asset population bound, matching the host design's sizing assumption. */
const MAX_PAGES = 25;
/**
 * How soon to retry after a failed sweep that left the cache empty, and how many times.
 * Covers the startup race the prefetch can lose (see `scheduleRetryIfEmpty`); bounded so a
 * genuinely broken tenant does not retry forever.
 */
const EMPTY_RETRY_MS = 15_000;
const EMPTY_RETRY_LIMIT = 4;

/**
 * Above this many assets in scope the store stops sweeping the fleet and switches to
 * {@link AssetStoreMode} `high-volume`: roots up front, branches on expand.
 *
 * It is exactly the old truncation point (`MAX_PAGES * PAGE_SIZE`), which is the honest place to
 * draw the line — beyond it the sweep never held the fleet anyway, it held an arbitrary
 * `_id`-ordered slice and rendered the leftovers as thousands of fake roots. A 700k-object tenant
 * additionally made this a 24-request burst every 30 seconds for a tree that was wrong.
 *
 * Hardcoded, not a tenant option: it is a property of the platform's page size and the browser's
 * memory, not of a deployment. To exercise the mode on an ordinary tenant, lower this constant —
 * the same testing route `PREFETCH_THRESHOLD` documents in `~services/search`.
 */
export const HIGH_VOLUME_THRESHOLD = MAX_PAGES * PAGE_SIZE;

/**
 * How many pages of one branch's children to pull before asking the user.
 *
 * The tree's own rule is "no 'load more', ever" (tree-component-design §3.4): a branch renders all
 * 114 of its children because the user cannot tell absent from unloaded. That holds for real
 * fleets; it stops being physically possible for a group with tens of thousands of direct
 * children, so past this point the branch says so explicitly with a "load more" row rather than
 * silently truncating. 3 pages = 6000 children, well beyond any real park.
 */
const BRANCH_PAGE_LIMIT = 3;

/** Depth pre-loaded when a `high-volume` session opens, so the drawer is never empty. */
const HV_PREFETCH_DEPTH = 2;

/** Concurrent branch loads during the depth prefetch. Modest: this competes with page load. */
const HV_PREFETCH_CONCURRENCY = 4;

/**
 * Rendezvous key for the cross-bundle state. Same reasoning as
 * `AiContextService`: `shared` is not federated, so every plugin bundle compiles
 * its own copy of this class with its own `'root'` instance. The drawer and the
 * overlay live in different bundles and must see **one** cache and **one** poll —
 * otherwise `⌘K` would show a different fleet than the drawer just did (AC-T3),
 * and each bundle would sweep the inventory on its own timer.
 *
 * `@c8y/devkit` shares `@angular/core` as a federation singleton, so a signal
 * parked here is natively trackable from any bundle.
 */
const CORE_SYMBOL = Symbol.for('c8y-ps.asset-store.v2');

interface AssetStoreCore {
  hierarchy: WritableSignal<AssetHierarchy | null>;
  loading: WritableSignal<boolean>;
  error: WritableSignal<string | null>;
  config: WritableSignal<AssetStoreConfig>;
  /**
   * Which loading strategy this tenant got, or `unknown` before the size probe has answered.
   * Sticky for the session; `configure()` resets it when the scope changes.
   */
  mode: WritableSignal<AssetStoreMode | 'unknown'>;
  /** `high-volume` only: the top-level sweep's MOs, keyed by id. */
  skeleton: Map<string, RawManagedObject>;
  /** `high-volume` only: `parentId` → that branch's fetched children. */
  branches: Map<string, BranchCacheEntry>;
  /** In-flight branch loads, so two expands of the same node share one request. */
  branchInFlight: Map<string, Promise<void>>;
  branchStatus: WritableSignal<ReadonlyMap<string, BranchStatus>>;
  /**
   * Monotonic token for branch responses. `@c8y/client` takes no `AbortSignal`, so a
   * superseded response cannot be cancelled — it is *discarded* by comparing this
   * (`AssetDetailService.loadLatest` does the same).
   */
  loadToken: number;
  /** Resolved once per config, then reused across polls. */
  rootId: string | null;
  timer: ReturnType<typeof setInterval> | null;
  /** In-flight sweep, so concurrent `refresh()` calls coalesce. */
  inFlight: Promise<void> | null;
  /**
   * Containers currently displaying the tree. > 0 selects the active (fast) cadence. A
   * signal, not a plain counter, because `intervalMs` is a `computed` over it — a plain
   * field would let that computed cache a stale cadence.
   */
  consumers: WritableSignal<number>;
  /** The interval the running timer was armed with, so we only rearm on a real change. */
  timerIntervalMs: number | null;
  /** Set once `start()` has run, so the background poll is armed exactly once. */
  started: boolean;
  /** Pending short retry while the cache is still empty. */
  retryTimer: ReturnType<typeof setTimeout> | null;
  retriesLeft: number;
  visibilityListener: (() => void) | null;
}

type GlobalWithCore = typeof globalThis & { [CORE_SYMBOL]?: AssetStoreCore };

function resolveCore(): AssetStoreCore {
  const scope = globalThis as GlobalWithCore;
  return (scope[CORE_SYMBOL] ??= {
    hierarchy: signal<AssetHierarchy | null>(null),
    loading: signal(false),
    error: signal<string | null>(null),
    config: signal<AssetStoreConfig>({ ...DEFAULT_ASSET_STORE_CONFIG }),
    mode: signal<AssetStoreMode | 'unknown'>('unknown'),
    skeleton: new Map(),
    branches: new Map(),
    branchInFlight: new Map(),
    branchStatus: signal<ReadonlyMap<string, BranchStatus>>(new Map()),
    loadToken: 0,
    rootId: null,
    timer: null,
    inFlight: null,
    consumers: signal(0),
    timerIntervalMs: null,
    started: false,
    retryTimer: null,
    retriesLeft: EMPTY_RETRY_LIMIT,
    visibilityListener: null,
  });
}

/**
 * The asset store: the whole visible asset hierarchy in memory, with alarms and
 * availability rolled up every level.
 *
 * **Cadence.** The sweep starts when the plugin loads, not when a tree is first opened
 * (`provideAssetStorePrefetch()` → {@link start}), and then polls on two rates: every
 * `idleIntervalMs` (5 min) in the background, rising to `activeIntervalMs` (30 s) while a
 * container is displaying the tree, and back down when the last one closes. Ticks are
 * skipped while the tab is hidden and caught up when it becomes visible again.
 *
 * That is a deliberate reversal of the original NFR-T2 reading ("a tenant that never opens
 * the tree never sweeps the inventory"): the cost of one sweep per 5 minutes per session is
 * accepted in exchange for the tree being instant on first open.
 *
 * This is the tier-0 slice of the `NavigationStore` designed in
 * `docs/FastNavigation/host-component-design.md` §3 — same field vocabulary, so the
 * enrichment (`POST /enrich`) and realtime (aggregation-ms WebSocket) layers can be
 * added later without reshaping anything here. Do not add a second hierarchy cache.
 *
 * Deliberately **polling, not realtime**: the host design reserves notification
 * fan-out for aggregation-ms and forbids the client subscribing to c8y notification
 * channels directly.
 */
@Injectable({ providedIn: 'root' })
export class AssetStoreService {
  private readonly core = resolveCore();
  /**
   * This bundle's own client. Every bundle's instance talks to the same tenant with
   * the same credentials, so whichever one happens to run the sweep is equivalent —
   * only the *cache* has to be shared, not the client.
   */
  private readonly inventory = inject(InventoryService);
  private readonly identity = inject(IdentityService);
  private readonly definitions = inject(AssetDefinitionService);

  /** The cached fleet, or `null` before the first sweep completes. */
  readonly hierarchy: Signal<AssetHierarchy | null> = this.core.hierarchy.asReadonly();
  readonly loading: Signal<boolean> = this.core.loading.asReadonly();
  /** Message from the last failed sweep; cleared by the next success. */
  readonly error: Signal<string | null> = this.core.error.asReadonly();
  readonly config: Signal<AssetStoreConfig> = this.core.config.asReadonly();

  /**
   * Which loading strategy this tenant got. `unknown` until the size probe answers, which is
   * why {@link highVolume} is the flag to render from — a container must not draw
   * "large-fleet mode" chrome during the probe.
   */
  readonly mode: Signal<AssetStoreMode | 'unknown'> = this.core.mode.asReadonly();

  /** True once the tenant is known to be too large to hold. See {@link HIGH_VOLUME_THRESHOLD}. */
  readonly highVolume = computed(() => this.mode() === 'high-volume');

  /** Per-branch load state, for spinners and "load more" rows. Empty in `full` mode. */
  readonly branchStatus: Signal<ReadonlyMap<string, BranchStatus>> =
    this.core.branchStatus.asReadonly();

  /**
   * The search index over the cached fleet, rebuilt whenever the sweep publishes a new
   * hierarchy or the DTM definitions arrive.
   *
   * A `computed`, so it is built on first *read* — a session that never opens a tree never
   * pays for it, even though the sweep itself runs from plugin load.
   *
   * Pure, deliberately: the definitions are *requested* by {@link connect}, not from in
   * here. Kicking the fetch off inside the computed made it a side effect that wrote the
   * very signal it then read, so index construction depended on when somebody first read
   * it — a computed has to be a projection of its inputs and nothing else.
   */
  readonly searchIndex = computed<AssetSearchIndex | null>(() => {
    const hierarchy = this.hierarchy();

    if (!hierarchy) return null;

    return buildAssetIndex(hierarchy, this.definitions.indexableProperties());
  });

  /** ISO timestamp of the data currently on screen — what a "as of" label shows. */
  readonly asOf = computed(() => this.hierarchy()?.asOf ?? null);
  readonly rootIds = computed<readonly string[]>(() => this.hierarchy()?.rootIds ?? []);
  /** Total assets cached, for the footer count. */
  readonly size = computed(() => this.hierarchy()?.byId.size ?? 0);

  /**
   * Narrows or retunes the sweep. Applying a different scope drops the cache — the
   * tree must never blend two scopes — and triggers a reload if anyone is watching.
   */
  configure(patch: Partial<AssetStoreConfig>): void {
    const current = this.core.config();
    const next = { ...current, ...patch };

    if (
      next.rootId === current.rootId &&
      next.leafType === current.leafType &&
      next.idleIntervalMs === current.idleIntervalMs &&
      next.activeIntervalMs === current.activeIntervalMs &&
      next.hierarchyTypes.join() === current.hierarchyTypes.join()
    ) {
      return;
    }
    const scopeChanged = next.rootId !== current.rootId;

    this.core.config.set(next);

    if (scopeChanged) {
      this.core.rootId = null;
      this.core.hierarchy.set(null);
      // A different scope is a different size question, and everything loaded for the old one
      // belongs to a hierarchy this store no longer represents.
      this.core.mode.set('unknown');
      this.resetHighVolumeState();
    }
    this.armTimer();
    if (this.core.started) void this.refresh();
  }

  /**
   * Starts the background poll and kicks off the first sweep. Called once when the plugin
   * loads (`provideAssetStorePrefetch()`), **not** when a tree is first opened: the fleet
   * sweep is the slowest thing the tree does, so paying for it up front is what makes the
   * first `⌘K` feel instant instead of showing a spinner.
   *
   * Idempotent and safe from every bundle — the guard lives in the shared global state, so
   * whichever plugin loads first arms the one timer.
   */
  start(): void {
    if (this.core.started) return;
    this.core.started = true;
    this.armTimer();
    void this.refresh();
  }

  /**
   * Registers a **visible** consumer — a container currently displaying the tree — and
   * returns a teardown. Call from an injection context to have destruction handled; see
   * {@link connectAssetStore}.
   *
   * Connecting does not start polling (`start()` did that at plugin load); it raises the
   * cadence from `idleIntervalMs` to `activeIntervalMs` for as long as something is on
   * screen, and drops it back when the last container goes away. It also starts the poll
   * defensively, so a tree that is somehow mounted without the prefetch provider still
   * refreshes rather than sitting on a stale cache.
   */
  connect(): () => void {
    this.core.consumers.update((count) => count + 1);
    this.start();
    this.armTimer();
    // The DTM definitions behind the search index (once per session, latched in the
    // service). Here rather than at `start()` because a container displaying a tree is the
    // only thing that ever reads the index — and rather than inside the `searchIndex`
    // computed, which must stay pure.
    void this.definitions.load();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.core.consumers.update((count) => Math.max(0, count - 1));
      this.armTimer();
    };
  }

  /**
   * Re-reads the fleet now. Concurrent calls share the in-flight sweep rather than
   * queueing a second one — the regenerate button and the timer can coincide.
   */
  refresh(): Promise<void> {
    this.core.inFlight ??= this.load().finally(() => {
      this.core.inFlight = null;
    });

    return this.core.inFlight;
  }

  node(id: string): AssetNode | undefined {
    return this.hierarchy()?.byId.get(id);
  }

  /** Subtree state. Returns the empty rollup for an unknown id, never `undefined`. */
  rollupOf(id: string): AssetRollup {
    return this.hierarchy()?.rollup.get(id) ?? EMPTY_ROLLUP;
  }

  /** Root → node, inclusive — what the sticky path header and pinned rows show. */
  pathOf(id: string): AssetNode[] {
    return pathOf(this.hierarchy(), id);
  }

  /** `Fleet › North Sea › East › 069` — the path as one string. */
  pathLabel(id: string, separator = ' › '): string {
    return this.pathOf(id)
      .map((node) => node.name)
      .join(separator);
  }

  /**
   * The cadence the poll should currently run at: fast while a tree is on screen, the
   * background rate otherwise.
   */
  readonly intervalMs = computed(() =>
    this.core.consumers() > 0 ? this.config().activeIntervalMs : this.config().idleIntervalMs
  );

  /**
   * Arms the timer at the cadence {@link intervalMs} asks for. A no-op when it is already
   * running at that interval, so the common case — a container connecting while another is
   * still open — does not reset the countdown.
   *
   * Switching *up* to the fast cadence also refreshes immediately: the user just opened the
   * tree, and waiting up to 30s for the first fast tick would show them the tail of the
   * 5-minute one.
   */
  private armTimer(): void {
    if (!this.core.started) return;
    const interval = this.intervalMs();

    if (this.core.timer && this.core.timerIntervalMs === interval) return;

    const speedingUp = this.core.timerIntervalMs !== null && interval < this.core.timerIntervalMs;

    if (this.core.timer) clearInterval(this.core.timer);
    this.installVisibilityListener();
    this.core.timerIntervalMs = interval;
    this.core.timer = setInterval(() => {
      // A hidden tab is not looking at the tree; polling it would burn tenant request
      // budget for nobody. The visibility listener refreshes on return.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void this.refresh();
    }, interval);

    if (speedingUp) void this.refresh();
  }

  /**
   * Installed for the lifetime of the poll, which is now the lifetime of the page: the
   * background sweep is meant to survive with nobody watching, so there is no longer a
   * point at which the listener should come off. Registered once, guarded by the shared
   * global state so a second bundle does not add a duplicate.
   */
  private installVisibilityListener(): void {
    if (this.core.visibilityListener || typeof document === 'undefined') return;

    const listener = () => {
      // Catch up on whatever the hidden ticks skipped, rather than waiting for the next one.
      if (document.visibilityState === 'visible') void this.refresh();
    };

    document.addEventListener('visibilitychange', listener);
    this.core.visibilityListener = listener;
  }

  private async fetchPage(
    query: string,
    page: number
  ): Promise<{ assets: RawManagedObject[]; totalPages?: number }> {
    const response = await this.inventory.list({
      query,
      pageSize: PAGE_SIZE,
      currentPage: page,
      // The child-asset references ARE the hierarchy — `withParents` is not used
      // on purpose (it ignores inventory roles; see `buildHierarchy`).
      withChildren: true,
      skipChildrenNames: true,
      withTotalPages: page === 1,
    });
    return {
      assets: response.data as unknown as RawManagedObject[],
      totalPages: response.paging?.totalPages,
    };
  }

  private async load(): Promise<void> {
    this.core.loading.set(true);

    try {
      const query = await this.sweepQuery();

      if (this.core.mode() === 'unknown') {
        this.core.mode.set(await this.probeMode(query));
      }

      if (this.core.mode() === 'high-volume') {
        await this.loadHighVolume();
      } else {
        await this.loadFullFleet(query);
      }

      this.core.error.set(null);
      // A good sweep re-earns the fast-retry budget: the allowance exists for a transient
      // startup failure, and a session that has worked once may hit another one later
      // (a token refresh, a brief network drop) that also deserves a quick recovery.
      this.core.retriesLeft = EMPTY_RETRY_LIMIT;
    } catch (error) {
      // Keep the previous hierarchy on screen: a failed poll must degrade to stale
      // data, never to an empty tree (NFR-T5).
      this.core.error.set(error instanceof Error ? error.message : String(error));
      this.scheduleRetryIfEmpty();
    } finally {
      this.core.loading.set(false);
    }
  }

  /**
   * One ~1 KB request that decides the loading strategy.
   *
   * Deliberately **not** derived from sweep page 1: that costs a full 2000-object page with child
   * references, and by the time its `totalPages` came back the old code had already fired pages
   * 2..25 concurrently — the exact burst this mode exists to avoid. `pageSize: 1` makes
   * `totalPages` the element count.
   *
   * A failed probe answers `full`: the sweep degrades gracefully on its own (and still caps), so a
   * transient error must not strand a small tenant in the partial-data mode for the session.
   *
   * Note `withTotalPages` statistics are cached platform-side for 10 s. Fine for a once-per-session
   * probe; do not build a polling counter on this.
   */
  private async probeMode(query: string): Promise<AssetStoreMode> {
    try {
      const response = await this.inventory.list({
        query,
        pageSize: 1,
        currentPage: 1,
        withChildren: false,
        withTotalPages: true,
      });
      const total = response.paging?.totalPages;

      if (typeof total !== 'number') return 'full';

      if (total > HIGH_VOLUME_THRESHOLD) {
        // Too many assets to hold at once: roots up front, branches on expand.
        return 'high-volume';
      }

      return 'full';
    } catch {
      return 'full';
    }
  }

  /** The original whole-fleet sweep, unchanged for every tenant that fits. */
  private async loadFullFleet(query: string): Promise<void> {
    // Page 1 first, because its `statistics.totalPages` tells us how many more there
    // are — then fetch the rest concurrently. Sequential paging made a 5000-asset
    // fleet three latency-additive round trips on every poll and on first paint.
    const first = await this.fetchPage(query, 1);
    const raw: RawManagedObject[] = [...first.assets];

    const totalPages = Math.min(first.totalPages ?? 1, MAX_PAGES);

    if (totalPages > 1) {
      const rest = await Promise.all(
        Array.from({ length: totalPages - 1 }, (_unused, index) => this.fetchPage(query, index + 2))
      );

      for (const page of rest) raw.push(...page.assets);
    }

    // Reachable only when the fleet grew past the cap *within* a session (the probe routes a
    // tenant this size to high-volume mode from the start). The next probe-on-scope-change or
    // reload picks the right mode up; until then the warning is the signal.
    if ((first.totalPages ?? 1) > MAX_PAGES && isDevMode()) {
      console.warn(
        `[AssetStoreService] Stopped at the ${HIGH_VOLUME_THRESHOLD}-asset cap — the tree is showing a truncated fleet.`
      );
    }

    this.core.hierarchy.set(
      buildHierarchy(
        raw,
        new Date().toISOString(),
        this.core.config().leafType,
        this.core.hierarchy()
      )
    );
  }

  /**
   * `high-volume` mode: refresh the roots, and let expansion pull the rest.
   *
   * The **roots only** — deliberately no type predicate anywhere in this path. Which types happen
   * to be groups is a tenant's business, not this store's, and hardcoding "everything except
   * `wind_turbine`" would both miss group types nobody told us about and sweep 690k turbines on a
   * tenant that names them differently. `childAssets` says what has children; that is enough.
   *
   * Already-loaded branches are **not** re-fetched here. Polling 350 open parks every 30 s would
   * recreate the request storm this mode exists to end; instead {@link loadChildren} refetches a
   * branch when it is expanded and its cache has aged past the current cadence.
   */
  private async loadHighVolume(): Promise<void> {
    const roots = await this.fetchRoots();

    this.core.skeleton = new Map(roots.map((asset) => [String(asset.id), asset]));
    this.publishHighVolume();

    // Open the top of the tree without waiting to be asked: a drawer showing one collapsed row is
    // technically correct and useless. Everything deeper is expansion-driven.
    await this.prefetchDepth(HV_PREFETCH_DEPTH);
  }

  /**
   * The top of the hierarchy. Scoped to the configured root when there is one, otherwise the
   * tenant's parentless assets — the platform's own `onlyRoots`, which also treats "parent you
   * cannot see" as a root, so a restricted user still gets a tree.
   */
  private async fetchRoots(): Promise<RawManagedObject[]> {
    const config = this.core.config();
    const rootId = config.rootId ?? this.core.rootId ?? (await this.discoverRoot());

    if (rootId) {
      this.core.rootId = rootId;
      const response = await this.inventory.list({
        query: `$filter=(_id eq '${rootId}')`,
        pageSize: 1,
        currentPage: 1,
        withChildren: true,
        withChildrenCount: true,
        skipChildrenNames: true,
      });
      const assets = response.data as unknown as RawManagedObject[];

      if (assets.length) return assets;
    }

    const response = await this.inventory.list({
      query: `$filter=(has(c8y_IsAsset)) $orderby=name asc`,
      onlyRoots: true,
      pageSize: PAGE_SIZE,
      currentPage: 1,
      withChildren: true,
      withChildrenCount: true,
      skipChildrenNames: true,
    });
    return response.data;
  }

  /**
   * Loads every pending branch down to `depth`, breadth-first, in bounded batches.
   *
   * Reads the freshly published hierarchy each round rather than trusting a plan made up front —
   * a branch's children are only known once its parent has landed.
   */
  private async prefetchDepth(depth: number): Promise<void> {
    for (let level = 0; level < depth; level++) {
      const hierarchy = this.core.hierarchy();

      if (!hierarchy) return;
      const pending = [...hierarchy.pendingChildren].filter(
        (id) => (hierarchy.byId.get(id)?.depth ?? Number.MAX_SAFE_INTEGER) <= level
      );

      if (!pending.length) return;

      for (let index = 0; index < pending.length; index += HV_PREFETCH_CONCURRENCY) {
        await Promise.all(
          pending.slice(index, index + HV_PREFETCH_CONCURRENCY).map((id) => this.loadChildren(id))
        );
      }
    }
  }

  /**
   * Fetches one branch's children, or reuses what is cached.
   *
   * Concurrent callers share one request (two components reacting to the same expand is the normal
   * case, not the exception). A cached branch is returned as-is until it ages past the current poll
   * cadence, then refetched in the background while the cached rows stay on screen — the tree must
   * never blank out a branch the user is looking at.
   *
   * A no-op in `full` mode: there the sweep already holds every child.
   */
  async loadChildren(parentId: string): Promise<void> {
    if (this.core.mode() !== 'high-volume') return;

    const inFlight = this.core.branchInFlight.get(parentId);

    if (inFlight) return inFlight;

    const cached = this.core.branches.get(parentId);

    if (cached && !isBranchStale(cached, new Date().toISOString(), this.intervalMs())) return;

    const request = this.fetchBranch(parentId, 1).finally(() => {
      this.core.branchInFlight.delete(parentId);
    });

    this.core.branchInFlight.set(parentId, request);

    return request;
  }

  /**
   * Pulls the next page of a branch that hit {@link BRANCH_PAGE_LIMIT} — the explicit
   * "load more" the tree otherwise refuses to have.
   */
  async loadMoreChildren(parentId: string): Promise<void> {
    if (this.core.mode() !== 'high-volume') return;
    const cached = this.core.branches.get(parentId);

    if (!cached || missingChildCount(cached) === 0) return;

    const inFlight = this.core.branchInFlight.get(parentId);

    if (inFlight) return inFlight;

    const request = this.fetchBranch(parentId, cached.pagesLoaded + 1, cached).finally(() => {
      this.core.branchInFlight.delete(parentId);
    });

    this.core.branchInFlight.set(parentId, request);

    return request;
  }

  /**
   * One or more pages of `GET /inventory/managedObjects/{id}/childAssets`.
   *
   * Three parameters carry the design:
   * - `query=$filter=has(c8y_IsAsset)` — the asset filter runs **server-side** (this endpoint
   *   accepts the query language), so controllers and RTUs never cross the wire. Matches what the
   *   full-mode sweep selects.
   * - `withChildrenCount=true` — the only way to know whether a child has children of its own, now
   *   that `withChildren` defaults to `false`. Without it every loaded turbine would look like a
   *   leaf and every loaded park like a dead end.
   * - `withTotalElements` on the first page only. Elements, not pages: the number wanted is "how
   *   many children are there", which is also what the "load more" row counts down. The parent's
   *   own `childAssets.count` is *not* used for this — it counts every child, including the
   *   non-asset ones this query filters out.
   */
  private async fetchBranch(
    parentId: string,
    fromPage: number,
    existing?: BranchCacheEntry
  ): Promise<void> {
    const token = ++this.core.loadToken;

    this.setBranchStatus(parentId, 'loading');

    try {
      const assets: RawManagedObject[] = existing ? [...existing.assets] : [];
      let pagesLoaded = existing?.pagesLoaded ?? 0;
      let total = existing?.total ?? 0;

      const lastPage = existing ? fromPage : BRANCH_PAGE_LIMIT;

      for (let page = fromPage; page <= lastPage; page++) {
        const response = await this.inventory.childAssetsList(parentId, {
          query: '$filter=(has(c8y_IsAsset))',
          pageSize: PAGE_SIZE,
          currentPage: page,
          withChildrenCount: true,
          withTotalElements: page === 1,
        });
        const batch = (response.data ?? []) as unknown as RawManagedObject[];

        assets.push(...batch);
        pagesLoaded = page;
        if (page === 1) total = response.paging?.totalElements ?? batch.length;

        if (batch.length < PAGE_SIZE) {
          // A short page is the end of the collection, whatever the totals claimed.
          total = assets.length;
          break;
        }
        // An exact multiple of the page size would otherwise cost one empty request to discover
        // the end.
        if (assets.length >= total) break;
      }

      // A superseded load (the scope changed, or a newer fetch for the same branch won) must not
      // write: `@c8y/client` cannot cancel, so discarding is the only mechanism available.
      if (token !== this.core.loadToken || this.core.mode() !== 'high-volume') return;

      const entry: BranchCacheEntry = {
        assets,
        total: Math.max(total, assets.length),
        loadedAt: new Date().toISOString(),
        pagesLoaded,
      };

      this.core.branches.set(parentId, entry);
      this.setBranchStatus(parentId, missingChildCount(entry) > 0 ? 'partial' : 'loaded');
      this.publishHighVolume();
    } catch {
      // One branch failing is not a broken tree: the row shows the error state and stays
      // expandable, and nothing already on screen is disturbed.
      this.setBranchStatus(parentId, 'error');
    }
  }

  /**
   * Makes `id` present in the hierarchy, loading whatever chain of branches it takes.
   *
   * This is what lets a pinned turbine, a deep link or a hit handed over from the global search
   * still be revealed in a tree that holds almost nothing: ask the platform for the asset's
   * ancestors, find the nearest one we already hold, then load down from there.
   *
   * `withParents` is safe and correct here — it is documented to ignore inventory roles, which is
   * a *problem* when inferring hierarchy shape (hence `buildHierarchy` uses `childAssets`) but
   * exactly what is wanted when merely locating a branch to fetch.
   */
  async ensureLoaded(id: string): Promise<AssetNode | undefined> {
    const existing = this.node(id);

    if (existing || this.core.mode() !== 'high-volume') return existing;

    try {
      const response = await this.inventory.detail(id, { withParents: true, withChildren: false });
      const asset = (response.data ?? {}) as unknown as RawManagedObject & {
        assetParents?: { references?: { managedObject?: { id?: string | number } }[] };
      };

      // The platform returns ancestors innermost-first; `parentOf` needs each id's own parent.
      const ancestors = (asset.assetParents?.references ?? [])
        .map((reference) => reference.managedObject?.id)
        .filter((value): value is string | number => value !== undefined && value !== null)
        .map(String);

      const parentOf = new Map<string, string | null>();
      let child = id;

      for (const ancestor of ancestors) {
        parentOf.set(child, ancestor);
        child = ancestor;
      }
      parentOf.set(child, null);

      const chain = ancestorChainToLoaded(
        id,
        parentOf,
        new Set(this.core.hierarchy()?.byId.keys())
      );

      if (!chain) return undefined;

      // Outermost first, sequentially: each load is what makes the next parent renderable.
      for (const branchId of chain) await this.loadChildren(branchId);

      return this.node(id);
    } catch {
      return undefined;
    }
  }

  /** Rebuilds and publishes from the skeleton plus every loaded branch. */
  private publishHighVolume(): void {
    const raw = mergeLoadedAssets(this.core.skeleton, this.core.branches);

    this.core.hierarchy.set(
      buildHierarchy(
        raw,
        new Date().toISOString(),
        this.core.config().leafType,
        this.core.hierarchy(),
        {
          highVolume: true,
        }
      )
    );
  }

  private setBranchStatus(parentId: string, status: BranchStatus): void {
    const next = new Map(this.core.branchStatus());

    next.set(parentId, status);
    this.core.branchStatus.set(next);
  }

  private resetHighVolumeState(): void {
    this.core.loadToken++;
    this.core.skeleton = new Map();
    this.core.branches = new Map();
    this.core.branchInFlight = new Map();
    this.core.branchStatus.set(new Map());
  }

  /** How many known children of `parentId` are not loaded — the "load more" count. */
  missingChildren(parentId: string): number {
    return missingChildCount(this.core.branches.get(parentId));
  }

  /**
   * Retries soon, but only while there is **nothing** cached yet.
   *
   * The prefetch runs from an environment initializer, i.e. as early as the plugin loads,
   * which can be before the shell has finished authenticating. Leaving that to the ordinary
   * cadence would mean an empty tree for up to `idleIntervalMs` (5 minutes) after a
   * transient startup failure. Once anything is cached this does nothing — a failed poll
   * over existing data is just staleness, and the next tick handles it.
   */
  private scheduleRetryIfEmpty(): void {
    if (this.core.hierarchy() || this.core.retryTimer) return;
    if (this.core.retriesLeft <= 0) return;
    this.core.retriesLeft--;
    this.core.retryTimer = setTimeout(() => {
      this.core.retryTimer = null;
      void this.refresh();
    }, EMPTY_RETRY_MS);
  }

  /**
   * The sweep query, in the form proven by the backend's `GET /api/assets`
   * (`apps/backend/backwind/server/routes/api/assets.get.ts`) — keep the two in step.
   * Three details in it are load-bearing:
   *
   * - `isinhierarchyof(<id>)` matches the root **and all descendants** in one query, so
   *   the whole fleet is one paged request rather than a per-level walk.
   * - `_id gt '0'` with `$orderby=_id asc` pins the sweep to the id index. Ordering by
   *   anything else makes `currentPage` paging unstable across a multi-page collection —
   *   rows shift between pages, so a page can be fetched twice and another missed. This
   *   matters more here than in the backend, because `load()` fetches pages 2..n
   *   **concurrently**: parallel paging is only correct over a stable order.
   * - `$filter` and `$orderby` are one query-language string separated by a **space**.
   *   They are not two HTTP parameters; joining them with `&` either escapes to a literal
   *   `&` inside the filter or splits off an `$orderby` the endpoint ignores. Either way
   *   the ordering silently does not apply.
   *
   * `has(c8y_IsAsset)` diverges from the backend's `has(c8y_IsDeviceGroup)` on purpose:
   * that route stops at the wind park, while the tree has to render the turbines inside
   * it. It still excludes the controller/RTU/SCADA devices, which are not tree rows.
   */
  private async sweepQuery(): Promise<string> {
    const config = this.core.config();
    const rootId = config.rootId ?? this.core.rootId ?? (await this.discoverRoot());

    if (rootId) {
      this.core.rootId = rootId;

      return `$filter=(_id gt '0' and (isinhierarchyof(${rootId}) and has(c8y_IsAsset))) $orderby=_id asc`;
    }
    // No discoverable root: a tenant with parks but no root group still gets a tree.
    const types = config.hierarchyTypes.map((type) => `type eq '${type}'`).join(' or ');
    return `$filter=(_id gt '0' and has(c8y_IsAsset) and (${types})) $orderby=_id asc`;
  }

  /**
   * The fleet root, found the way the backend route does: through the Identity API, as the
   * managed object behind the external id {@link FLEET_ROOT_EXTERNAL_ID_TYPE} /
   * {@link FLEET_ROOT_EXTERNAL_ID}.
   *
   * Deliberately not "the first `onlyRoots` hit" any more (#382): a tenant can hold several
   * parentless device groups — imports, test data, another solution's root — and which one
   * the platform lists first is not something a tree should depend on. Nor a `type eq '…'`
   * match, which would depend on a type name being spelled the way we expect in every tenant.
   * An external id is a deliberate marker on exactly one object.
   *
   * The `onlyRoots` lookup stays as a fallback for a tenant that has not been given the
   * marker, so an unprovisioned tenant still gets a tree — at the cost of the ambiguity above,
   * which the dev-mode warning points out.
   */
  private async discoverRoot(): Promise<string | null> {
    try {
      const { data } = await this.identity.detail({
        type: FLEET_ROOT_EXTERNAL_ID_TYPE,
        externalId: FLEET_ROOT_EXTERNAL_ID,
      });
      const id = data?.managedObject?.id;

      if (id !== undefined && id !== null) return String(id);
    } catch {
      // 404 (no such external id) or a transient failure: fall through to the legacy lookup.
    }

    if (isDevMode()) {
      console.warn(
        `[AssetStoreService] No external id ${FLEET_ROOT_EXTERNAL_ID_TYPE}/${FLEET_ROOT_EXTERNAL_ID} on this tenant — falling back to the first root device group, which is ambiguous when there are several.`
      );
    }

    try {
      const response = await this.inventory.list({
        fragmentType: 'c8y_IsDeviceGroup',
        onlyRoots: true,
        pageSize: 1,
        withChildren: false,
      });
      const root = response.data[0];
      return root ? String(root.id) : null;
    } catch {
      // Not fatal — the type-union fallback covers it.
      return null;
    }
  }
}

/**
 * Connects the injecting component to the store for its lifetime and returns the store.
 * Marks the caller as *displaying* the tree, which selects the fast cadence. The idiomatic
 * entry point:
 *
 * ```ts
 * private readonly assets = connectAssetStore();
 * ```
 */
export function connectAssetStore(): AssetStoreService {
  const store = inject(AssetStoreService);
  const release = store.connect();

  inject(DestroyRef).onDestroy(release);

  return store;
}

/**
 * Prefetches the fleet and starts the background poll **as soon as the plugin loads**, so
 * the first time a tree is opened the data is already there.
 *
 * Add it to a plugin's `*ViewProviders` array:
 *
 * ```ts
 * export const assetTreeNavigatorViewProviders = [provideAssetStorePrefetch(), …];
 * ```
 *
 * Safe to add from several plugins — `start()` is idempotent across bundles, so whichever
 * loads first arms the single shared timer.
 */
export function provideAssetStorePrefetch(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideEnvironmentInitializer(() => inject(AssetStoreService).start()),
  ]);
}
