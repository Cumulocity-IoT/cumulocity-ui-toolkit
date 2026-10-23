import { Injectable, Signal, WritableSignal, inject, signal } from '@angular/core';
import { FetchClient } from '@c8y/client';
import type { AssetDefinition, AssetPropertyDefinition } from '@c8y/ngx-components';
import {
  buildIndexablePropertyMap,
  type AssetIndexablePropertyMap,
} from './asset-definition.model';
import { toTypeFacets } from './asset-type-facets';
import type { TypeFacet } from '../search/search.model';

/**
 * The DTM definitions behind the search index: which properties an asset of a given type
 * carries, and what they are called.
 *
 * Read **once per session**, not per poll. Definitions are schema, not state — a tenant
 * changes them when someone edits the data model, which is not something the navigator has
 * to track live. A successful load publishes {@link AssetDefinitionService.indexableProperties},
 * which is what the search index is computed from — so the index rebuilds by itself when the
 * definitions arrive, with no separate revision counter to keep in step.
 *
 * Failure is not an error condition here: a tenant without DTM subscribed, or a user
 * without the definition permissions, simply gets the heuristic fallback in
 * `asset-definition.model.ts`. Search has to keep working — before this existed it only
 * matched names, and that is exactly what the fallback preserves.
 */
const CORE_SYMBOL = Symbol.for('c8y-ps.asset-definitions.v1');

/** DTM lives behind the `dtm` microservice; both definition collections page the same way. */
const DTM_BASE = 'service/dtm';
const PAGE_SIZE = 2000;

interface DefinitionCore {
  properties: WritableSignal<AssetIndexablePropertyMap>;
  /** The same `/definitions/assets` response, projected into global-search chips. */
  facets: WritableSignal<readonly TypeFacet[]>;
  loaded: boolean;
  inFlight: Promise<void> | null;
}

type GlobalWithCore = typeof globalThis & { [CORE_SYMBOL]?: DefinitionCore };

function resolveCore(): DefinitionCore {
  const scope = globalThis as GlobalWithCore;
  return (scope[CORE_SYMBOL] ??= {
    properties: signal<AssetIndexablePropertyMap>(new Map()),
    facets: signal<readonly TypeFacet[]>([]),
    loaded: false,
    inFlight: null,
  });
}

@Injectable({ providedIn: 'root' })
export class AssetDefinitionService {
  private readonly core = resolveCore();
  private readonly client = inject(FetchClient);

  /** Indexable properties per asset type. Empty until (and unless) the load succeeds. */
  readonly indexableProperties: Signal<AssetIndexablePropertyMap> =
    this.core.properties.asReadonly();

  /**
   * The same catalog as a list of selectable asset-type chips, for the global search
   * palette (`~services/search`). It rides along on this service rather than fetching
   * `/definitions/assets` a second time — one DTM read per session serves both readers.
   *
   * Worth knowing why the catalog and not the inventory: asset types are **not** managed
   * objects carrying `c8y_IsAssetType`. That query answers 200 with zero rows, so reading
   * the catalog from the inventory fails silently, with no error to notice.
   */
  readonly typeFacets: Signal<readonly TypeFacet[]> = this.core.facets.asReadonly();

  /**
   * Loads the definitions once. Idempotent and shared across bundles; concurrent callers
   * await the same request.
   */
  load(): Promise<void> {
    if (this.core.loaded) return Promise.resolve();
    this.core.inFlight ??= this.fetchAll().finally(() => {
      this.core.inFlight = null;
    });

    return this.core.inFlight;
  }

  private async fetchAll(): Promise<void> {
    try {
      const [assets, properties] = await Promise.all([
        this.fetchDefinitions<AssetDefinition>('/definitions/assets'),
        this.fetchDefinitions<AssetPropertyDefinition>('/definitions/properties'),
      ]);
      const map = buildIndexablePropertyMap(assets, properties);

      this.core.facets.set(toTypeFacets(assets));
      // A tenant with DTM subscribed but no asset models yet answers 200 with an empty
      // collection. Publishing that as "loaded" would pin every type to an empty property
      // list; leaving the map empty lets the per-node fallback run instead.
      this.core.loaded = true;
      if (map.size) this.core.properties.set(map);
    } catch {
      // No DTM, no permission, or an older platform: the fallback covers it. Latched so a
      // 403 is not retried on every index rebuild.
      this.core.loaded = true;
    }
  }

  private async fetchDefinitions<T>(path: string): Promise<T[]> {
    const response = await this.client.fetch(`${DTM_BASE}${path}`, {
      method: 'GET',
      headers: { accept: 'application/json' },
      params: { pageSize: PAGE_SIZE, currentPage: 1 },
    });

    if (!response.ok) throw new Error(`${path}: ${response.status} ${response.statusText}`);
    const json = (await response.json()) as { definitions?: T[] };
    return Array.isArray(json.definitions) ? json.definitions : [];
  }
}
