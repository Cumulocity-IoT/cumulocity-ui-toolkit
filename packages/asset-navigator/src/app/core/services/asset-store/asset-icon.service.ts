import { Injectable, type Signal, type WritableSignal, inject, signal } from '@angular/core';
import { GroupService } from '@c8y/ngx-components';
import type { IManagedObject } from '@c8y/client';
import { ASSET_TYPE_ICONS, type AssetNode } from './asset-store.model';

/**
 * Row icons, resolved the way the platform's own group navigation resolves them: through
 * `GroupService.getIcon()`, the same call behind the `getGroupIcon` pipe that
 * `c8y-search-input` and the asset selector use.
 *
 * For an asset that means the icon declared on its **asset type** (the `c8y_IsAssetType`
 * managed objects, watched for changes by the platform's own realtime service), falling back
 * to the managed object's own `icon.name` and then to a generic glyph. So a tenant that gives
 * `wind_park` a custom icon in the asset-type editor sees it here without us shipping
 * anything — which is the point of asking the API instead of hardcoding a map.
 *
 * Resolution is async and per type, so:
 *
 * - `iconFor()` returns a **synchronous best guess immediately** — our static
 *   {@link ASSET_TYPE_ICONS} entry, or a generic fallback — and kicks off the lookup. Rows
 *   must never wait for an icon, and must never render a hole where one will appear.
 * - Results are cached per asset **type**, so one lookup serves a 114-turbine park.
 * - The cache is a signal, so the swap from guess to resolved icon repaints `OnPush` rows
 *   by itself.
 */
@Injectable({ providedIn: 'root' })
export class AssetIconService {
  private readonly groups = inject(GroupService);

  /** Resolved icons by cache key. A signal so rows repaint when a lookup lands. */
  private readonly resolved: WritableSignal<Readonly<Record<string, string>>> = signal({});
  /** Keys already requested, so a fleet of turbines triggers one lookup, not 114. */
  private readonly pending = new Set<string>();

  readonly icons: Signal<Readonly<Record<string, string>>> = this.resolved.asReadonly();

  /**
   * The icon to draw for `node` right now. Safe to call from a `computed` — the lookup it
   * may start is fire-and-forget and writes to the cache signal later.
   */
  iconFor(node: AssetNode): string {
    const key = cacheKey(node);
    const resolved = this.resolved()[key];

    if (resolved) return resolved;
    this.request(key, node);

    return ASSET_TYPE_ICONS[node.type] ?? FALLBACK_ICON;
  }

  private request(key: string, node: AssetNode): void {
    if (this.pending.has(key)) return;
    this.pending.add(key);

    // `properties` is the whole managed object minus the fragments the store drops, so it
    // still carries what `GroupService` keys off: `c8y_IsAsset`, `c8y_IsDeviceGroup`,
    // `c8y_IsDevice` and `icon`. Rebuild the identity fields it also reads.
    const mo = {
      ...node.properties,
      id: node.id,
      name: node.name,
      type: node.type,
    } as unknown as IManagedObject;

    this.groups
      .getIcon(mo, false, ASSET_TYPE_ICONS[node.type] ?? FALLBACK_ICON)
      .then((icon) => {
        if (!icon) return;
        this.resolved.update((current) => ({ ...current, [key]: icon }));
      })
      .catch(() => {
        // Keep the static guess. An icon is not worth surfacing an error for, and the
        // `pending` entry stops us retrying a lookup that is failing for a whole type.
      });
  }
}

/** Generic glyph for a type we have no mapping for and the API cannot resolve. */
const FALLBACK_ICON = 'circle-o';

/**
 * Per **type**, except for a node carrying its own `icon.name` — `GroupService` prefers that
 * over the asset type's default, so such a node cannot share the type's cache entry.
 */
function cacheKey(node: AssetNode): string {
  const own = (node.properties as { icon?: { name?: string } } | undefined)?.icon?.name;
  return own ? `mo:${node.id}` : `type:${node.type}`;
}
