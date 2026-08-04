import { inject, Injectable } from '@angular/core';
import { FetchClient, InventoryService, TenantOptionsService } from '@c8y/client';
import { defer, firstValueFrom, from, Observable, of, throwError } from 'rxjs';
import { catchError, map, retry, switchMap, tap } from 'rxjs/operators';
import { AssetFilterConfig, AssetFilterMethod } from '../models/asset-access.model';

export type { AssetFilterMethod };
export type { AssetFilterConfig };

interface CacheEntry {
  data: string[];
  timestamp: number;
}

interface InventoryRoleAssignment {
  id?: number;
  managedObject: string;
  roles: InventoryRole[];
}

export interface InventoryRole {
  id: number;
  name: string;
  description?: string;
}

@Injectable()
export class AssetAccessService {
  private readonly DEFAULT_CACHE_TTL = 5 * 60 * 1000;

  private cache = new Map<string, CacheEntry>();

  private fetchClient = inject(FetchClient);

  private tenantOptionsService = inject(TenantOptionsService);

  private inventoryService = inject(InventoryService);

  /**
   * Fetches asset IDs using a pre-loaded configuration object.
   *
   * Errors are propagated rather than mapped to an empty array: callers have to
   * be able to tell "this user has no assets" apart from "we could not find out".
   *
   * @param config - The asset filter configuration to use
   * @returns Observable of asset ID strings array
   */
  getAssetIdsFromConfig(config: AssetFilterConfig): Observable<string[]> {
    return this.fetchAssetIds(config);
  }

  /**
   * Fetches asset IDs as an Observable. Errors are propagated — see
   * {@link getAssetIdsFromConfig}.
   *
   * @param configCategory - The tenant option category to load configuration from
   * @param configKey - The tenant option key to load configuration from
   * @returns Observable of asset ID strings array
   */
  getAssetIds(configCategory: string, configKey: string): Observable<string[]> {
    return this.loadConfig(configCategory, configKey).pipe(
      switchMap((config) => this.fetchAssetIds(config))
    );
  }

  /**
   * Fetches asset IDs using a pre-loaded configuration object as a Promise
   * @param config - The asset filter configuration to use
   * @returns Promise resolving to asset ID strings array
   */
  async getAssetIdsFromConfigAsync(config: AssetFilterConfig): Promise<string[]> {
    return firstValueFrom(this.getAssetIdsFromConfig(config));
  }

  /**
   * Fetches asset IDs as a Promise (request-based)
   * @param configCategory - The tenant option category to load configuration from
   * @param configKey - The tenant option key to load configuration from
   * @returns Promise resolving to asset ID strings array
   */
  async getAssetIdsAsync(configCategory: string, configKey: string): Promise<string[]> {
    return firstValueFrom(this.getAssetIds(configCategory, configKey));
  }

  /**
   * Clears all cached asset IDs
   */
  refreshCache(): void {
    this.cache.clear();
  }

  /**
   * Invalidates a specific cache entry by key
   * @param key - The cache key to invalidate
   */
  invalidateCacheEntry(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Loads the asset filter configuration from tenant options
   * @param configCategory - The tenant option category to load configuration from
   * @param configKey - The tenant option key to load configuration from
   * @returns Observable emitting the asset filter configuration
   * @private
   */
  private loadConfig(configCategory: string, configKey: string): Observable<AssetFilterConfig> {
    return from(
      this.tenantOptionsService.detail({ category: configCategory, key: configKey })
    ).pipe(
      map((result) => {
        const option = result.data;

        try {
          return {
            cacheTtl: this.DEFAULT_CACHE_TTL,
            ...(option?.value ? (JSON.parse(option.value) as Partial<AssetFilterConfig>) : {}),
          } as AssetFilterConfig;
        } catch (parseErr) {
          // A malformed option is a configuration error, not "no assets".
          throw new Error(
            `[AssetAccessService] Tenant option ${configCategory}/${configKey} does not contain valid JSON`,
            { cause: parseErr }
          );
        }
      }),
      catchError((err: unknown) => {
        // A missing tenant option simply means the filter was never configured,
        // which is a legitimate "nothing to filter by". Anything else is an error.
        if (this.isNotFound(err)) {
          return of(this.getEmptyConfig());
        }

        return throwError(() => err);
      })
    );
  }

  /** A configuration that resolves to no assets. */
  private getEmptyConfig(): AssetFilterConfig {
    return {
      method: 'custom-endpoint',
      endpoint: '',
      cacheTtl: this.DEFAULT_CACHE_TTL,
    } satisfies AssetFilterConfig;
  }

  private isNotFound(err: unknown): boolean {
    const status =
      (err as { res?: { status?: number }; status?: number } | null)?.res?.status ??
      (err as { status?: number } | null)?.status;

    return status === 404;
  }

  /**
   * Fetches asset IDs from cache or source based on configuration
   * @param config - The asset filter configuration
   * @returns Observable of asset ID strings
   * @private
   */
  private fetchAssetIds(config: AssetFilterConfig): Observable<string[]> {
    const cacheKey = this.getCacheKey(config);
    const cached = this.getFromCache(cacheKey, config.cacheTtl);

    if (cached !== null) {
      return of(cached);
    }

    // Only successful results are cached, so a failure is retried on next call.
    return this.resolveAssetIds(config).pipe(tap((ids) => this.setCache(cacheKey, ids)));
  }

  /**
   * Resolves asset IDs based on the configured method
   * @param config - The asset filter configuration specifying the resolution method
   * @returns Observable of asset ID strings from the selected source
   * @private
   */
  private resolveAssetIds(config: AssetFilterConfig): Observable<string[]> {
    switch (config.method) {
      case 'custom-endpoint':
        return config.endpoint
          ? this.fetchFromEndpoint({ ...config, endpoint: config.endpoint })
          : of([] as string[]);

      case 'managed-object':
        return config.managedObjectId
          ? this.fetchFromManagedObject(config.managedObjectId, config.fragment)
          : of([] as string[]);

      case 'inventory-query':
        return config.query ? this.fetchFromInventoryQuery(config.query) : of([] as string[]);

      default:
        return throwError(
          () => new Error(`[AssetAccessService] Unknown filter method "${String(config.method)}"`)
        );
    }
  }

  /**
   * Fetches asset IDs from an HTTP endpoint
   * @param endpoint - The HTTP endpoint URL to fetch from
   * @returns Observable of asset ID strings with automatic retry on failure
   * @private
   */
  private fetchFromEndpoint(
    config: AssetFilterConfig & { endpoint: string }
  ): Observable<string[]> {
    // `defer` so that `retry` actually issues a new request — retrying a
    // subscription to an already-created promise would just replay its result.
    const request = () =>
      this.fetchClient
        .fetch(config.endpoint, { method: 'GET', headers: { 'Content-Type': 'application/json' } })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`Request failed with status ${response.status}`);
          }

          return response.json() as Promise<
            { assetIds: string[] } | string[] | InventoryRoleAssignment[]
          >;
        })
        .then((res) => {
          if (Array.isArray(res)) return res as string[];
          if ('assetIds' in res) return res.assetIds;
          if ('inventoryAssignments' in res)
            return this.digestInventory(
              (res as { inventoryAssignments: InventoryRoleAssignment[] }).inventoryAssignments
            );

          return [];
        });

    return defer(request).pipe(retry(1));
  }

  /**
   * Fetches asset IDs from a managed object using an optional fragment path
   * @param managedObjectId - The ID of the managed object to fetch from
   * @param fragment - Optional dot-notation path to the asset IDs property (e.g., 'custom.assetIds'). Defaults to 'assetIds' if not provided.
   * @returns Observable of asset ID strings from the managed object
   * @private
   */
  private fetchFromManagedObject(managedObjectId: string, fragment?: string): Observable<string[]> {
    const fragmentPath = fragment || 'assetIds';

    return from(this.inventoryService.detail(managedObjectId)).pipe(
      map((result) => {
        const value = this.getNestedValue<string[] | InventoryRoleAssignment[]>(
          result.data,
          fragmentPath
        );

        if (!Array.isArray(value)) {
          return [];
        }

        // Discriminate on the element shape. The previous `typeof value === 'object'`
        // check was true for *any* array, so a plain `string[]` fragment — the
        // documented default — was run through `digestInventory` and became
        // `[undefined]`.
        if (value.every((entry): entry is string => typeof entry === 'string')) {
          return value;
        }

        return this.digestInventory(value.filter((entry) => !!entry?.managedObject));
      })
    );
  }

  /**
   * Fetches asset IDs by querying managed objects in inventory
   * @param query - The inventory query string to filter managed objects
   * @returns Observable of managed object IDs matching the query
   * @private
   */
  private fetchFromInventoryQuery(query: string): Observable<string[]> {
    return from(this.inventoryService.list({ query })).pipe(
      map((result) => {
        const data = result.data;

        if (!data || data.length === 0) return [];

        // Check if data contains InventoryRoleAssignment objects
        if (typeof data[0] === 'object' && data[0] !== null && 'managedObject' in data[0]) {
          return this.digestInventory(data as unknown as InventoryRoleAssignment[]);
        }

        // Default: extract id from managed objects
        return data.map((item) => item.id) || [];
      })
    );
  }

  /**
   * Generates a cache key from the filter configuration
   * @param config - The asset filter configuration
   * @returns A unique cache key string for the configuration
   * @private
   */
  private getCacheKey(config: AssetFilterConfig): string {
    switch (config.method) {
      case 'custom-endpoint':
        return `endpoint:${config.endpoint || ''}`;

      case 'managed-object':
        return `mo:${config.managedObjectId || ''}:${config.fragment || 'assetIds'}`;

      case 'inventory-query':
        return `query:${config.query || ''}`;

      default:
        // `resolveAssetIds` rejects unknown methods; this only has to be stable.
        return `unknown:${String(config.method)}`;
    }
  }

  /**
   * Retrieves a cached value if it hasn't expired
   * @param key - The cache key to look up
   * @param ttl - Optional time-to-live in milliseconds; uses DEFAULT_CACHE_TTL if not provided
   * @returns Cached asset ID array if valid and not expired, null otherwise
   * @private
   */
  private getFromCache(key: string, ttl?: number): string[] | null {
    const entry = this.cache.get(key);

    if (!entry) return null;

    const age = Date.now() - entry.timestamp;
    const expiryTime = ttl || this.DEFAULT_CACHE_TTL;

    if (age > expiryTime) {
      this.cache.delete(key);

      return null;
    }

    return entry.data;
  }

  /**
   * Stores asset IDs in cache with current timestamp
   * @param key - The cache key to store under
   * @param data - The asset ID array to cache
   * @private
   */
  private setCache(key: string, data: string[]): void {
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  /**
   * Retrieves a nested value from an object using dot-notation path
   * @template T - The type of the value to retrieve
   * @param obj - The object to traverse
   * @param path - The dot-notation path to the value (e.g., 'custom.nested.assetIds')
   * @returns The value at the specified path or undefined if not found
   * @private
   */
  private getNestedValue<T>(obj: unknown, path: string): T | undefined {
    return path.split('.').reduce<unknown>((current, key) => {
      return current && typeof current === 'object' && key in current
        ? (current as Record<string, unknown>)[key]
        : undefined;
    }, obj) as T | undefined;
  }

  private digestInventory(roles: InventoryRoleAssignment[]): string[] {
    return roles.map((role) => role.managedObject);
  }
}
