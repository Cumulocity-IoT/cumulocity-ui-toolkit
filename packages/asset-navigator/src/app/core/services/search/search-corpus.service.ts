import {
  Injectable,
  type Signal,
  type WritableSignal,
  inject,
  isDevMode,
  signal,
} from '@angular/core';
import { FetchClient } from '@c8y/client';
import { AssetStoreService } from '../asset-store/asset-store.service';
import type { AssetHierarchy, AssetNode } from '../asset-store/asset-store.model';
import { compileToInventoryParams, toQueryString, type SearchQuery } from './inventory-query';
import {
  PREFETCH_LIMIT,
  PREFETCH_THRESHOLD,
  keywordsOf,
  toSearchResult,
  type InventoryCollectionResponse,
  type SearchMode,
  type SearchResult,
} from './search.model';
import type { IManagedObject } from '@c8y/client';

/**
 * The candidate source for the global search, and the thing that decides which mode the
 * tenant is in.
 *
 * Why a corpus at all: the platform's `text=` matches whole tokens through a stemmer, so
 * measured on a live tenant `Rost` and `Rostocl` both return **nothing** for `Rostock`.
 * The local matcher can only re-rank what came back, so a narrow server filter caps the
 * search however good the ranking is. Holding the candidates is the only way to tolerate a
 * typo — and at or below `PREFETCH_THRESHOLD` the whole corpus is one request, which is why the
 * boundary is the platform's own page size.
 *
 * **What this does NOT do is sweep the asset hierarchy.** `AssetStoreService` already holds
 * the fleet — one `isinhierarchyof` sweep, polled, shared across every plugin bundle
 * through `Symbol.for('c8y-ps.asset-store.v1')`. Re-fetching it here would be a second
 * copy of the same data on the same page, so assets are *read from that cache* and only the
 * remainder — the devices the fleet sweep deliberately excludes (`has(c8y_IsAsset)` skips
 * controllers, RTUs and SCADA boxes) — is fetched, once.
 *
 * The consequence, stated because it is a real limit: an asset **outside** the swept root
 * is in neither source, so global search will not find it. `verifyCoverage` compares what
 * we assembled against the probe's own count and warns in dev mode when they diverge, so
 * this shows up as a log line rather than as a mystery missing row. The fix, if a tenant
 * needs it, is `AssetStoreService.configure({ rootId })` — not a second sweep here.
 */
const CORE_SYMBOL = Symbol.for('c8y-ps.search-corpus.v1');

interface SearchCorpusCore {
  /** The assembled corpus, or `null` before the first load / when too large to hold. */
  corpus: WritableSignal<readonly SearchResult[] | null>;
  mode: WritableSignal<SearchMode | null>;
  /** Sticky: once the tenant is known to be too large, stop probing on every search. */
  tooLarge: boolean;
  /** In-flight load, so concurrent callers share one request. */
  loading: Promise<readonly SearchResult[] | undefined> | null;
}

type GlobalWithCore = typeof globalThis & { [CORE_SYMBOL]?: SearchCorpusCore };

function resolveCore(): SearchCorpusCore {
  const host = globalThis as GlobalWithCore;

  host[CORE_SYMBOL] ??= {
    corpus: signal<readonly SearchResult[] | null>(null),
    mode: signal<SearchMode | null>(null),
    tooLarge: false,
    loading: null,
  };

  return host[CORE_SYMBOL];
}

@Injectable({ providedIn: 'root' })
export class SearchCorpusService {
  private readonly core = resolveCore();
  private readonly assets = inject(AssetStoreService);
  private readonly fetchClient = inject(FetchClient);

  /** Which mode the tenant resolved to, or `null` before the first probe. */
  readonly mode: Signal<SearchMode | null> = this.core.mode.asReadonly();
  /** The held corpus, or `null` in passthrough mode. */
  readonly corpus: Signal<readonly SearchResult[] | null> = this.core.corpus.asReadonly();

  /**
   * The whole corpus, or `undefined` when the tenant is too large to hold. Loads at most
   * once per session; concurrent callers share one request.
   */
  async load(): Promise<readonly SearchResult[] | undefined> {
    if (this.core.tooLarge) return undefined;

    const cached = this.core.corpus();

    if (cached) return cached;

    this.core.loading ??= this.assemble().finally(() => {
      this.core.loading = null;
    });

    return this.core.loading;
  }

  /**
   * Applies the structural parts of a query locally, so a prefetched tenant filters
   * identically to the `$filter` path without a round trip. Text matching is the ranker's
   * job, not this one's.
   */
  static filter(corpus: readonly SearchResult[], query: SearchQuery): SearchResult[] {
    const types = query.typeChips?.length ? new Set(query.typeChips) : undefined;
    const severities = query.activeAlarmSeverities ?? [];
    const scopes = query.scopeIds ?? [];

    return corpus.filter((result) => {
      if (types && !types.has(result.type)) return false;

      // `isinhierarchyof` semantics: the scope itself and everything below it.
      if (
        scopes.length > 0 &&
        !scopes.some((id) => result.id === id || (result.ancestorIds ?? []).includes(id))
      ) {
        return false;
      }
      if (query.onlyDevices && !result.isDevice) return false;
      if (query.onlyAssets && !result.isAsset) return false;

      if (severities.length > 0) {
        const alarms = result.alarms;

        if (!alarms || !severities.some((severity) => alarms[severity] > 0)) return false;
      }

      return true;
    });
  }

  private async assemble(): Promise<readonly SearchResult[] | undefined> {
    const total = await this.probeSize();

    if (total === undefined || total > PREFETCH_THRESHOLD) {
      this.core.tooLarge = true;
      this.core.mode.set('passthrough');

      return undefined;
    }

    // The fleet cache is the source for assets. It runs from plugin load, but a search
    // opened early can still beat the first sweep — so wait for it rather than assembling
    // a corpus with no assets in it.
    if (!this.assets.hierarchy()) {
      await this.assets.refresh();
    }

    const hierarchy = this.assets.hierarchy();
    const fromStore = hierarchy ? storeResults(hierarchy) : [];
    const devices = await this.fetchDevices();

    // Ids can legitimately appear in both (a turbine that is also a device), and the store
    // projection is the richer one — it carries the rolled-up breadcrumb.
    const byId = new Map<string, SearchResult>();

    for (const device of devices) byId.set(device.id, device);
    for (const asset of fromStore) byId.set(asset.id, asset);

    const corpus = [...byId.values()];

    this.verifyCoverage(corpus.length, total);
    this.core.corpus.set(corpus);
    this.core.mode.set('prefetched');

    return corpus;
  }

  /**
   * The devices the fleet sweep excludes. One request at the platform's maximum page size: this
   * only runs in prefetched mode, where the tenant is small enough that there is nothing an
   * incremental strategy would buy.
   * `withParents` because the breadcrumb needs ancestors; children are the expensive part
   * of an inventory payload and no row shows them.
   */
  private async fetchDevices(): Promise<SearchResult[]> {
    const compiled = compileToInventoryParams(
      { onlyDevices: true, page: { size: PREFETCH_LIMIT, current: 1 } },
      { withParents: true }
    );

    try {
      const response = await this.fetchClient.fetch(
        `/inventory/managedObjects?${toQueryString(compiled)}`
      );

      if (!response.ok) return [];
      const body = (await response.json()) as InventoryCollectionResponse;
      return (body.managedObjects ?? []).map(toSearchResult);
    } catch {
      // A failed device fetch degrades the corpus to assets only, which is still a usable
      // search. Failing the whole load would be worse.
      return [];
    }
  }

  /** One cheap call for the count. Totals are opt-in because they are expensive. */
  private async probeSize(): Promise<number | undefined> {
    const compiled = compileToInventoryParams(
      { onlyAssetsOrDevices: true, page: { size: 1, current: 1 } },
      { withTotalElements: true, withParents: false }
    );

    try {
      const response = await this.fetchClient.fetch(
        `/inventory/managedObjects?${toQueryString(compiled)}`
      );

      if (!response.ok) return undefined;
      const body = (await response.json()) as InventoryCollectionResponse;
      return body.statistics?.totalElements;
    } catch {
      return undefined;
    }
  }

  /**
   * The probe counted every asset-or-device in the tenant; the corpus was assembled from
   * the swept fleet plus the devices. A shortfall means objects exist that neither source
   * covers — almost always assets outside the swept root — and those are unfindable.
   */
  private verifyCoverage(assembled: number, total: number): void {
    if (!isDevMode() || assembled >= total) return;
    console.warn(
      `[SearchCorpusService] Holding ${assembled} of ${total} assets/devices. The remainder sits outside the swept fleet root and is not searchable — see AssetStoreService.configure({ rootId }).`
    );
  }
}

/**
 * Every cached fleet node as a result row.
 *
 * `ancestorIds` comes from **every** parent, not just the one the tree draws under. The store keeps
 * a single `parentId` ("first parent wins" in `linkHierarchy`), but an asset can be referenced by
 * several groups, and the platform's `isinhierarchyof` follows all of them — so a scope chip on the
 * second group must find it locally too, or the two modes disagree. The breadcrumb stays the one
 * drawn chain.
 */
export function storeResults(hierarchy: AssetHierarchy): SearchResult[] {
  const parentsOf = new Map<string, string[]>();

  for (const node of hierarchy.byId.values()) {
    for (const childId of node.childIds) {
      const parents = parentsOf.get(childId);

      if (parents) parents.push(node.id);
      else parentsOf.set(childId, [node.id]);
    }
  }

  return [...hierarchy.byId.values()].map((node) => toStoreResult(node, hierarchy, parentsOf));
}

/**
 * Projects a cached fleet node into a result row.
 *
 * `AssetNode.alarms` is already the `c8y_ActiveAlarmsStatus` projection with the same four
 * keys as `ActiveAlarms`, so it is reused directly — but an all-zero count has to read as
 * "no alarms", exactly as `toActiveAlarms` decides it for a raw managed object.
 */
function toStoreResult(
  node: AssetNode,
  hierarchy: AssetHierarchy,
  parentsOf: ReadonlyMap<string, readonly string[]>
): SearchResult {
  const totalAlarms =
    node.alarms.critical + node.alarms.major + node.alarms.minor + node.alarms.warning;
  const breadcrumb: string[] = [];
  const guard = new Set<string>();
  let parentId = node.parentId;

  while (parentId && !guard.has(parentId)) {
    guard.add(parentId);
    const parent = hierarchy.byId.get(parentId);

    if (!parent) break;
    breadcrumb.unshift(parent.name);
    parentId = parent.parentId;
  }

  // Every ancestor over every parent edge, nearest first; `seen` also stops a cycle.
  const seen = new Set<string>();
  const queue = [...(parentsOf.get(node.id) ?? [])];

  while (queue.length > 0) {
    const id = queue.shift()!;

    if (seen.has(id) || id === node.id) continue;
    seen.add(id);
    queue.push(...(parentsOf.get(id) ?? []));
  }

  return {
    id: node.id,
    name: node.name,
    type: node.type,
    isAsset: true,
    isDevice: 'c8y_IsDevice' in node.properties,
    breadcrumb,
    ancestorIds: [...seen],
    keywords: keywordsOf(node.properties as unknown as IManagedObject),
    highlights: [],
    ...(totalAlarms > 0 ? { alarms: { ...node.alarms } } : {}),
  };
}
