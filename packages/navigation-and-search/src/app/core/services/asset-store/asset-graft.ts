import type { RawManagedObject } from './asset-rollup';

/**
 * Assembling a partial hierarchy out of what has actually been fetched.
 *
 * `high-volume` mode never holds the fleet. It holds a **root skeleton** (the top levels, from
 * one small sweep) plus a **branch cache** (`parentId` → that parent's children, fetched when the
 * branch was expanded). This module turns those two into the flat `RawManagedObject[]` that
 * `buildHierarchy` already knows how to consume, so the store gains lazy loading without a second
 * hierarchy builder — the linking, cycle guards, sibling ordering, rollup and node-identity reuse
 * all stay in `asset-rollup.ts`.
 *
 * Pure and dependency-free (no Angular, no SDK), so vitest covers the part that can actually be
 * wrong. See `asset-graft.spec.ts`.
 *
 * **Why the parent's references have to be patched.** `withChildren` defaults to `false` on
 * current platforms (feature toggle `core.inventory.without.children`), and `GET
 * /inventory/managedObjects/{id}/childAssets` returns the children themselves — not an updated
 * parent. So after loading a branch, the parent MO in the skeleton still lists whatever references
 * it came with (possibly none at all). {@link mergeLoadedAssets} therefore rewrites the parent's
 * `childAssets.references` from the fetch context: *we* know whose children these are, and that
 * knowledge is more reliable than any reference list the platform happened to include.
 */

/** One branch's fetched children, plus what the platform said about the total. */
export interface BranchCacheEntry {
  /** The children as fetched, in platform order (sibling ordering happens in `buildHierarchy`). */
  assets: readonly RawManagedObject[];
  /** `childAssets.count` at fetch time — the total, which may exceed `assets.length`. */
  total: number;
  /** ISO timestamp of the fetch, for staleness checks. */
  loadedAt: string;
  /** How many pages have been pulled, so "load more" knows where to continue. */
  pagesLoaded: number;
}

/**
 * Flattens the skeleton and the branch cache into one deduped list, with each loaded parent's
 * `childAssets` rewritten to exactly the children we hold plus the real total.
 *
 * Dedupe rules, in order of authority:
 * 1. A **skeleton** entry wins over a branch copy of the same asset. The skeleton comes from an
 *    inventory sweep with `withChildren: true`, so it carries edges a `childAssets` response
 *    would not; letting the leaner copy overwrite it would drop a whole level.
 * 2. Otherwise **first branch wins**. An asset can legitimately be a child of two groups; the
 *    tree draws it once (`linkHierarchy` picks the first parent) and a second copy would only
 *    fight over identity.
 */
export function mergeLoadedAssets(
  skeleton: ReadonlyMap<string, RawManagedObject>,
  branches: ReadonlyMap<string, BranchCacheEntry>
): RawManagedObject[] {
  const merged = new Map<string, RawManagedObject>();

  for (const entry of branches.values()) {
    for (const asset of entry.assets) {
      const assetId = String(asset.id);

      // Never let a branch copy shadow a skeleton node, and never let a later branch shadow an
      // earlier one — see the dedupe rules above.
      if (!merged.has(assetId) && !skeleton.has(assetId)) merged.set(assetId, asset);
    }
  }

  for (const [id, asset] of skeleton) merged.set(id, asset);

  // Now rewrite the loaded parents. Done after the merge so a parent that appears in the skeleton
  // *and* has a loaded branch is patched exactly once, whichever order the maps were built in.
  for (const [parentId, entry] of branches) {
    const parent = merged.get(parentId);

    if (!parent) continue;
    merged.set(parentId, withChildReferences(parent, entry));
  }

  return [...merged.values()];
}

/**
 * A copy of the parent carrying references to the children we actually hold, and the platform's
 * total so `buildHierarchy` can tell "all loaded" from "more to come".
 *
 * A new object every time rather than a mutation: these MOs are cached across rebuilds, and the
 * node-identity reuse in `buildHierarchy` compares projections of them — mutating a cached input
 * would make an unchanged node look changed on the next poll.
 */
function withChildReferences(parent: RawManagedObject, entry: BranchCacheEntry): RawManagedObject {
  return {
    ...parent,
    childAssets: {
      references: entry.assets.map((asset) => ({ managedObject: { id: String(asset.id) } })),
      count: entry.total,
    },
  };
}

/**
 * The chain from `id` up to (and including) the nearest ancestor already in `loaded`, or `null`
 * when the walk leaves the known world.
 *
 * Used to reveal an asset nobody has expanded to — a pinned turbine, a deep link, a hit handed
 * over from the global search. `parentOf` comes from the platform's `assetParents` (which is
 * documented to ignore inventory roles, so it always resolves), and the result is the list of
 * branches to load, **outermost first**, so loading them in order always has a parent to attach to.
 *
 * Returns `[]` when `id` is already loaded. Guards against a cycle in `parentOf` — the platform
 * should not produce one, but this walk is driven by remote data and hanging the drawer is a worse
 * failure than giving up on a reveal.
 */
export function ancestorChainToLoaded(
  id: string,
  parentOf: ReadonlyMap<string, string | null>,
  loaded: ReadonlySet<string>
): string[] | null {
  if (loaded.has(id)) return [];

  const chain: string[] = [];
  const guard = new Set<string>([id]);
  let current: string | null | undefined = parentOf.get(id);

  while (current) {
    if (guard.has(current)) return null;
    guard.add(current);
    chain.unshift(current);
    if (loaded.has(current)) return chain;
    current = parentOf.get(current);
  }

  // Ran out of ancestors without meeting anything we hold: `id` sits outside the store's scope
  // (a different root), so there is nowhere in this tree to reveal it.
  return null;
}

/** Whether a cached branch is old enough to refetch, given the current poll cadence. */
export function isBranchStale(entry: BranchCacheEntry, nowIso: string, maxAgeMs: number): boolean {
  const loadedAt = Date.parse(entry.loadedAt);
  const now = Date.parse(nowIso);

  if (Number.isNaN(loadedAt) || Number.isNaN(now)) return true;

  return now - loadedAt >= maxAgeMs;
}

/** How many children of `parentId` are known to exist but are not held. */
export function missingChildCount(entry: BranchCacheEntry | undefined): number {
  if (!entry) return 0;

  return Math.max(entry.total - entry.assets.length, 0);
}
