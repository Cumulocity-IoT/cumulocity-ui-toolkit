import { Injectable, inject } from '@angular/core';
import { FetchClient } from '@c8y/client';
import { AssetDefinitionService } from '../asset-store/asset-definition.service';
import { SearchCorpusService } from './search-corpus.service';
import { compileToInventoryParams, toQueryString, type SearchQuery } from './inventory-query';
import {
  CANDIDATE_PAGE_SIZE,
  toSearchResult,
  type InventoryCollectionResponse,
  type SearchResponse,
  type SearchResult,
  type TypeFacet,
} from './search.model';

/**
 * Global search against the platform, in whichever mode the tenant's volume allows.
 *
 * There is no microservice here and no code path that looks for one: the plugin installs on
 * its own and works immediately, with nothing to deploy, subscribe or keep in sync. The two
 * modes differ **only** in how wide the candidate set is — the ranking is the same
 * `FuzzyService` either way, so results are ordered identically:
 *
 * - `prefetched` (≤ 2000 objects) — every keystroke is local over the held corpus, so every
 *   typo is matchable. This is the only mode in which `Rostocl` can reach `Rostock`.
 * - `passthrough` (above that) — one platform request per search, narrowed by `text=` first,
 *   and only that page is ranked. The UI reports the ceiling rather than hiding it.
 *
 * The caller's own credentials are used throughout, so inventory roles are enforced by the
 * platform and search can never surface an object the user may not see. That is also why a
 * future `indexed` mode must re-verify ids as the caller rather than trusting an index built
 * by a service user — see `docs/GlobalSearch/spec.md` §"Step 2".
 */
@Injectable({ providedIn: 'root' })
export class PlatformSearchBackend {
  private readonly fetchClient = inject(FetchClient);
  private readonly corpus = inject(SearchCorpusService);
  private readonly definitions = inject(AssetDefinitionService);

  async search(query: SearchQuery, signal?: AbortSignal): Promise<SearchResponse> {
    const corpus = await this.corpus.load();

    if (corpus) {
      return {
        results: SearchCorpusService.filter(corpus, query),
        status: { mode: 'prefetched', indexState: 'ready' },
        truncated: false,
      };
    }

    const compiled = compileToInventoryParams(
      { ...query, onlyAssetsOrDevices: true, page: { size: CANDIDATE_PAGE_SIZE, current: 1 } },
      // Ancestors are the dominant cost on a large tenant — 34 ms over 25 rows, more than
      // double over 100, a timeout over 500 — so this path forgoes breadcrumbs. The
      // prefetched path still asks for them, where it is one request over a corpus small
      // enough for it to be cheap.
      { withParents: false }
    );

    const response = await this.fetchClient.fetch(
      `/inventory/managedObjects?${toQueryString(compiled)}`,
      signal ? { signal } : {}
    );

    if (!response.ok) {
      throw new Error(`Inventory search failed with status ${response.status}`);
    }

    const body = (await response.json()) as InventoryCollectionResponse;
    const managedObjects = body.managedObjects ?? [];
    const results: SearchResult[] = managedObjects.map(toSearchResult);

    return {
      results,
      status: { mode: 'passthrough', indexState: 'absent' },
      // A full page back means the platform almost certainly had more to give, and
      // anything beyond it was never ranked.
      truncated: managedObjects.length >= CANDIDATE_PAGE_SIZE,
    };
  }

  /** Loads the corpus up front so the first search does not have to wait for it. */
  async prewarm(): Promise<void> {
    await this.corpus.load();
  }

  /**
   * Asset-type chips, from the Digital Twin Manager catalog the fleet cache already reads
   * once per session. Tenants without DTM simply get no chips.
   */
  async loadTypeFacets(): Promise<readonly TypeFacet[]> {
    await this.definitions.load();

    return this.definitions.typeFacets();
  }
}
