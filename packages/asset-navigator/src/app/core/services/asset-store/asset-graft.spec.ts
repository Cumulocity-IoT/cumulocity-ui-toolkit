import {
  ancestorChainToLoaded,
  isBranchStale,
  mergeLoadedAssets,
  missingChildCount,
  type BranchCacheEntry,
} from './asset-graft';
import { buildHierarchy, type RawManagedObject } from './asset-rollup';

/**
 * The lazy-loading assembly, tested where it can actually be wrong: dedupe authority, the
 * reference patching that makes `withChildren: false` survivable, and the ancestor walk that must
 * terminate on remote data.
 */

const asOf = '2026-08-05T09:00:00.000Z';
const LEAF = 'wind_turbine';

function mo(
  id: string,
  options: { type?: string; children?: string[]; count?: number; name?: string } = {}
): RawManagedObject {
  const references = (options.children ?? []).map((child) => ({ managedObject: { id: child } }));
  return {
    id,
    name: options.name ?? id,
    type: options.type ?? 'wind_park',
    childAssets: {
      references,
      ...(options.count === undefined ? {} : { count: options.count }),
    },
  };
}

function branch(
  assets: RawManagedObject[],
  total = assets.length,
  pagesLoaded = 1
): BranchCacheEntry {
  return { assets, total, loadedAt: asOf, pagesLoaded };
}

describe('mergeLoadedAssets', () => {
  it('rewrites a loaded parent to reference exactly the children it holds', () => {
    // The park arrived from the roots sweep with no references at all — which is what
    // `withChildren: false` produces — and the branch fetch is the only thing that knows better.
    const skeleton = new Map([['park', mo('park', { count: 2 })]]);
    const branches = new Map([
      ['park', branch([mo('t1', { type: LEAF }), mo('t2', { type: LEAF })], 2)],
    ]);

    const merged = mergeLoadedAssets(skeleton, branches);
    const park = merged.find((asset) => asset.id === 'park');

    expect(park?.childAssets?.references?.map((r) => r.managedObject?.id)).toEqual(['t1', 't2']);
    expect(park?.childAssets?.count).toBe(2);
    expect(merged.map((asset) => asset.id).sort()).toEqual(['park', 't1', 't2']);
  });

  it('keeps the platform total when only part of a branch is held, so the gap stays visible', () => {
    const skeleton = new Map([['park', mo('park')]]);
    const branches = new Map([['park', branch([mo('t1', { type: LEAF })], 500)]]);

    const park = mergeLoadedAssets(skeleton, branches).find((asset) => asset.id === 'park');

    expect(park?.childAssets?.count).toBe(500);
    expect(park?.childAssets?.references?.length).toBe(1);
  });

  it('never lets a branch copy shadow the skeleton node of the same asset', () => {
    // The skeleton copy came from a sweep with `withChildren: true`, so it carries the edges to
    // the level below; the branch copy does not. Overwriting it would drop a whole level.
    const skeleton = new Map([['area', mo('area', { children: ['park'] })]]);
    const branches = new Map([['region', branch([mo('area')])]]);

    const area = mergeLoadedAssets(skeleton, branches).find((asset) => asset.id === 'area');

    expect(area?.childAssets?.references?.map((r) => r.managedObject?.id)).toEqual(['park']);
  });

  it('keeps one copy of an asset that is a child of two branches', () => {
    const shared = mo('shared', { type: LEAF });
    const branches = new Map([
      ['a', branch([shared])],
      ['b', branch([shared])],
    ]);

    const merged = mergeLoadedAssets(new Map(), branches);

    expect(merged.filter((asset) => asset.id === 'shared')?.length).toBe(1);
  });

  it('ignores a branch whose parent is not held — nothing to attach it to', () => {
    const merged = mergeLoadedAssets(
      new Map(),
      new Map([['ghost', branch([mo('t1', { type: LEAF })])]])
    );

    // The child still merges (it is a real asset); only the parent patch is skipped.
    expect(merged.map((asset) => asset.id)).toEqual(['t1']);
  });

  it('does not mutate its inputs, so cached MOs stay comparable across rebuilds', () => {
    const park = mo('park', { count: 1 });
    const skeleton = new Map([['park', park]]);
    const branches = new Map([['park', branch([mo('t1', { type: LEAF })])]]);

    mergeLoadedAssets(skeleton, branches);

    expect(park.childAssets?.references).toEqual([]);
    expect(park.childAssets?.count).toBe(1);
  });
});

describe('mergeLoadedAssets → buildHierarchy', () => {
  it('produces a tree whose loaded park has its turbines and no pending flag', () => {
    const skeleton = new Map([
      ['root', mo('root', { children: ['park'], count: 1 })],
      ['park', mo('park', { count: 2 })],
    ]);
    const branches = new Map([
      ['park', branch([mo('t1', { type: LEAF, count: 0 }), mo('t2', { type: LEAF, count: 0 })], 2)],
    ]);

    const hierarchy = buildHierarchy(mergeLoadedAssets(skeleton, branches), asOf, LEAF, null, {
      highVolume: true,
    });

    expect(hierarchy.mode).toBe('high-volume');
    expect(hierarchy.byId.get('park')?.childIds).toEqual(['t1', 't2']);
    expect(hierarchy.pendingChildren.has('park')).toBe(false);
    // Fully loaded ⇒ the rollup may speak for the subtree.
    expect(hierarchy.rollup.get('park')?.partial).toBeUndefined();
    expect(hierarchy.rollup.get('park')?.turbineCount).toBe(2);
  });

  it('marks an unloaded park pending from its child count alone', () => {
    const skeleton = new Map([['park', mo('park', { count: 114 })]]);

    const hierarchy = buildHierarchy(mergeLoadedAssets(skeleton, new Map()), asOf, LEAF, null, {
      highVolume: true,
    });

    expect(hierarchy.pendingChildren.has('park')).toBe(true);
    expect(hierarchy.rollup.get('park')?.partial).toBe(true);
  });
});

describe('ancestorChainToLoaded', () => {
  const parentOf = new Map<string, string | null>([
    ['turbine', 'park'],
    ['park', 'area'],
    ['area', 'root'],
    ['root', null],
  ]);

  it('returns the branches to load, outermost first', () => {
    expect(ancestorChainToLoaded('turbine', parentOf, new Set(['root']))).toEqual([
      'root',
      'area',
      'park',
    ]);
  });

  it('stops at the nearest loaded ancestor', () => {
    expect(ancestorChainToLoaded('turbine', parentOf, new Set(['root', 'area']))).toEqual([
      'area',
      'park',
    ]);
  });

  it('returns an empty chain when the asset is already held', () => {
    expect(ancestorChainToLoaded('turbine', parentOf, new Set(['turbine']))).toEqual([]);
  });

  it('gives up when the walk never meets the loaded set — a different root entirely', () => {
    expect(ancestorChainToLoaded('turbine', parentOf, new Set(['elsewhere']))).toBeNull();
  });

  it('gives up rather than hanging on a cyclic parent chain', () => {
    const cyclic = new Map<string, string | null>([
      ['a', 'b'],
      ['b', 'c'],
      ['c', 'a'],
    ]);

    expect(ancestorChainToLoaded('a', cyclic, new Set(['nothing']))).toBeNull();
  });

  it('gives up when an asset is its own parent', () => {
    expect(ancestorChainToLoaded('a', new Map([['a', 'a']]), new Set(['root']))).toBeNull();
  });
});

describe('isBranchStale', () => {
  const entry = branch([], 0);

  it('is stale once the cache is older than the poll cadence', () => {
    expect(isBranchStale(entry, '2026-08-05T09:00:29.000Z', 30_000)).toBe(false);
    expect(isBranchStale(entry, '2026-08-05T09:00:30.000Z', 30_000)).toBe(true);
  });

  it('treats an unparseable timestamp as stale rather than trusting it forever', () => {
    expect(isBranchStale({ ...entry, loadedAt: 'not a date' }, asOf, 30_000)).toBe(true);
  });
});

describe('missingChildCount', () => {
  it('counts what the platform says exists minus what is held', () => {
    expect(missingChildCount(branch([mo('t1')], 500))).toBe(499);
    expect(missingChildCount(branch([mo('t1')], 1))).toBe(0);
  });

  it('never goes negative when more was fetched than the total claimed', () => {
    expect(missingChildCount(branch([mo('t1'), mo('t2')], 1))).toBe(0);
  });

  it('is zero for a branch that was never loaded', () => {
    expect(missingChildCount(undefined)).toBe(0);
  });
});
