import { Injectable, inject } from '@angular/core';
import { InventoryService } from '@c8y/client';
import type { DetailField } from '../../services/settings/detail-panel.model';
import { seriesFor } from './asset-detail-fields';

/**
 * The detail panel's lazy per-asset data — the **only** lazy fetch the tree makes
 * (NFR-T2). Everything else the panel shows comes out of the asset store's tier-0
 * cache and costs nothing.
 *
 * Rules from §6.5, all implemented here:
 *
 * - one request per asset, issued only on **committed hover intent** — the caller
 *   waits out the open delay before calling, and never prefetches on mouse-move;
 * - discarded on pointer-out (see `LoadHandle.cancel`);
 * - cached per asset for the session.
 */

/** Latest values keyed `<fragment>.<series>`, plus their units. */
export interface AssetLatestValues {
  values: Record<string, { value: number; unit?: string }>;
  /** ISO time of the newest reading in the set, when the platform reports one. */
  asOf?: string;
}

export interface LoadHandle<T> {
  result: Promise<T | null>;
  /**
   * Marks the in-flight load as unwanted. The HTTP request itself is not aborted —
   * the `@c8y/client` services take no `AbortSignal` — so this drops the response
   * instead of applying it. The user-visible effect is what §6.5 asks for: leaving a
   * row never repaints a panel with the row you left.
   */
  cancel: () => void;
}

@Injectable({ providedIn: 'root' })
export class AssetDetailService {
  private readonly inventory = inject(InventoryService);

  /** Session cache. Keyed by asset id; the value set is a superset per asset. */
  private readonly latestCache = new Map<string, AssetLatestValues>();
  private readonly inFlight = new Map<string, Promise<AssetLatestValues>>();

  cachedLatest(assetId: string): AssetLatestValues | undefined {
    return this.latestCache.get(assetId);
  }

  /**
   * Latest measurement values for the fields currently selected.
   *
   * Reads them through the inventory rather than the measurement API: one
   * `withLatestValues=true` read returns every series the asset has in the
   * `c8y_LatestMeasurements` fragment, so a panel showing four measurement fields still
   * costs one request. (Feature preview on the platform side; when it is unavailable
   * the values are simply absent and the rows render as unavailable.)
   */
  loadLatest(assetId: string, fields: readonly DetailField[]): LoadHandle<AssetLatestValues> {
    const needed = seriesFor(fields);
    const cached = this.latestCache.get(assetId);

    if (!needed.length || cached) {
      return { result: Promise.resolve(cached ?? { values: {} }), cancel: () => undefined };
    }

    let cancelled = false;
    const pending =
      this.inFlight.get(assetId) ??
      (() => {
        const request = this.fetchLatest(assetId).finally(() => this.inFlight.delete(assetId));

        this.inFlight.set(assetId, request);

        return request;
      })();

    return {
      result: pending.then((values) => (cancelled ? null : values)).catch((): null => null),
      cancel: () => {
        cancelled = true;
      },
    };
  }

  /** Drops the session cache — the store's poll found the fleet changed. */
  invalidate(assetId?: string): void {
    if (assetId) {
      this.latestCache.delete(assetId);

      return;
    }
    this.latestCache.clear();
  }

  private async fetchLatest(assetId: string): Promise<AssetLatestValues> {
    const response = await this.inventory.list({
      ids: [assetId],
      pageSize: 1,
      withChildren: false,
      withLatestValues: true,
    });
    const mo = response.data[0] as Record<string, unknown> | undefined;
    const latest = (mo?.['c8y_LatestMeasurements'] ?? {}) as Record<
      string,
      Record<string, { value?: unknown; unit?: unknown; time?: unknown }>
    >;

    const values: AssetLatestValues['values'] = {};
    let asOf: string | undefined;

    for (const [fragment, seriesMap] of Object.entries(latest)) {
      if (!seriesMap || typeof seriesMap !== 'object') continue;

      for (const [series, reading] of Object.entries(seriesMap)) {
        if (typeof reading?.value !== 'number') continue;
        values[`${fragment}.${series}`] = {
          value: reading.value,
          unit: typeof reading.unit === 'string' ? reading.unit : undefined,
        };
        if (typeof reading.time === 'string' && (!asOf || reading.time > asOf)) asOf = reading.time;
      }
    }

    const result: AssetLatestValues = { values, asOf };

    this.latestCache.set(assetId, result);

    return result;
  }
}
