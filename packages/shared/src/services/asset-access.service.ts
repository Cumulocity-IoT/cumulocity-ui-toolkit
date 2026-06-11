import { Injectable } from '@angular/core';
import { FetchClient, InventoryService, TenantOptionsService } from '@c8y/client';
import { firstValueFrom, from, Observable, of } from 'rxjs';
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

  constructor(
    private fetchClient: FetchClient,
    private tenantOptionsService: TenantOptionsService,
    private inventoryService: InventoryService
  ) {}

  /**
   * Fetches asset IDs using a pre-loaded configuration object
   * @param config - The asset filter configuration to use
   * @returns Observable of asset ID strings array
   */
  getAssetIdsFromConfig(config: AssetFilterConfig): Observable<string[]> {
    return this.fetchAssetIds(config).pipe(
      catchError((err) => {
        console.error('[AssetAccessService] Failed to fetch asset IDs from config', err);

        return of([] as string[]);
      })
    );
  }

  /**
   * Fetches asset IDs as an Observable
   * @param configCategory - The tenant option category to load configuration from
   * @param configKey - The tenant option key to load configuration from
   * @returns Observable of asset ID strings array
   */
  getAssetIds(configCategory: string, configKey: string): Observable<string[]> {
    return this.loadConfig(configCategory, configKey).pipe(
      switchMap((config) => this.fetchAssetIds(config)),
      catchError((err) => {
        console.error('[AssetAccessService] Failed to fetch asset IDs', err);

        return of([] as string[]);
      })
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
    return new Observable((observer) => {
      this.tenantOptionsService
        .detail({ category: configCategory, key: configKey })
        .then((result) => {
          const option = result.data;

          try {
            observer.next({
              cacheTtl: this.DEFAULT_CACHE_TTL,
              ...(option?.value ? JSON.parse(option.value) : {}),
            } as AssetFilterConfig);
          } catch (parseErr) {
            console.error(
              '[AssetAccessService] Failed to parse config JSON',
              parseErr,
              option?.value
            );
            observer.next({
              method: 'custom-endpoint',
              endpoint: '',
              cacheTtl: this.DEFAULT_CACHE_TTL,
            } as AssetFilterConfig);
          }
          observer.complete();
        })
        .catch((err) => {
          console.warn('[AssetAccessService] Failed to load config from tenant options', err);
          observer.next({
            method: 'custom-endpoint',
            endpoint: '',
            cacheTtl: this.DEFAULT_CACHE_TTL,
          } as AssetFilterConfig);
          observer.complete();
        });
    });
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

    return this.resolveAssetIds(config).pipe(
      tap((ids) => this.setCache(cacheKey, ids)),
      catchError((err) => {
        console.error('[AssetAccessService] Asset ID resolution failed', err, config);

        return of([] as string[]);
      })
    );
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
        return config.endpoint ? this.fetchFromEndpoint(config) : of([] as string[]);

      case 'managed-object':
        return config.managedObjectId
          ? this.fetchFromManagedObject(config.managedObjectId, config.fragment)
          : of([] as string[]);

      case 'inventory-query':
        return config.query ? this.fetchFromInventoryQuery(config.query) : of([] as string[]);

      default:
        console.warn('[AssetAccessService] Unknown filter method', config.method);

        return of([] as string[]);
    }
  }

  /**
   * Fetches asset IDs from an HTTP endpoint
   * @param endpoint - The HTTP endpoint URL to fetch from
   * @returns Observable of asset ID strings with automatic retry on failure
   * @private
   */
  private fetchFromEndpoint(config: AssetFilterConfig): Observable<string[]> {
    const request = this.fetchClient
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
        if (!res || !res['inventoryAssignments']) return [];

        const roles = res['inventoryAssignments'] as InventoryRoleAssignment[];

        if (roles.length === 0) return [];

        return this.digestInventory(roles);
      });

    return from(request).pipe(
      retry(1),
      catchError((err) => {
        console.error('[AssetAccessService] HTTP endpoint failed', config, err);

        return of([] as string[]);
      })
    );
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
    let value: string[] | InventoryRoleAssignment;

    return from(this.inventoryService.detail(managedObjectId)).pipe(
      map((result) => {
        value = this.getNestedValue<string[]>(result.data, fragmentPath);

        return typeof value === 'object'
          ? this.digestInventory(value as unknown as InventoryRoleAssignment[])
          : value || [];
      }),
      catchError((err) => {
        console.error(
          '[AssetAccessService] Failed to fetch from managed object',
          managedObjectId,
          err
        );

        return of([] as string[]);
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
      }),
      catchError((err) => {
        console.error('[AssetAccessService] Failed to fetch from inventory query', query, err);

        return of([] as string[]);
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
        console.warn('[AssetAccessService] Unknown cache key method', config.method);

        return 'unknown';
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
    return roles.map((role) => role.managedObject) || [];
  }
}
