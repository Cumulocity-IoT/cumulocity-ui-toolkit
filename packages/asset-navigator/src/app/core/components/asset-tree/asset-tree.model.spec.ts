import { buildHierarchy, type RawManagedObject } from '../../services/asset-store/asset-rollup';
import type { AssetHierarchy } from '../../services/asset-store/asset-store.model';
import { withLookupBudget } from '../../testing/lookup-budget';
import { buildAssetIndex } from '../../services/asset-store/asset-search';
import {
  EMPTY_TREE_FILTER,
  autoExpansionFor,
  filterHierarchy,
  flatten,
  type TreeFilter,
} from './asset-tree.model';

/**
 * The three walks that used to hang the tab on a cyclic hierarchy:
 *
 * - `flatten`'s depth-first `visit` (unbounded recursion → stack overflow),
 * - `flatten`'s "mark the ancestors of the current asset" loop (infinite loop),
 * - `autoExpansionFor`'s ancestor walk (infinite loop).
 *
 * A `childAssets` cycle is producible in a real tenant, and `buildHierarchy` turns one into
 * a cyclic `parentId` chain (asserted in `asset-rollup.spec.ts`), so each of these needs its
 * own guard.
 *
 * The cycle cases run against `withLookupBudget(...)`. That is not decoration: these loops
 * are synchronous, so `testTimeout` cannot preempt them — reverting any one guard makes the
 * plain version of these tests **hang the runner** instead of failing it. The budget turns
 * "does not terminate" into a named error on the test that provoked it.
 */

const asOf = '2026-07-30T12:00:00.000Z';
const LEAF = 'wind_turbine';

function mo(id: string, children: string[] = [], name = id, type = 'wind_park'): RawManagedObject {
  return {
    id,
    name,
    type,
    childAssets: { references: children.map((child) => ({ managedObject: { id: child } })) },
  };
}

const turbine = (id: string, name = id) => mo(id, [], name, LEAF);

/** `root → park → t1/t2`, the shape every non-cycle case here uses. */
function fleet() {
  return buildHierarchy(
    [mo('root', ['park']), mo('park', ['t1', 't2']), turbine('t1'), turbine('t2')],
    asOf,
    LEAF
  );
}

const filter = (patch: Partial<TreeFilter> = {}): TreeFilter => ({
  ...EMPTY_TREE_FILTER,
  ...patch,
});

const ids = (rows: { node: { id: string } }[]) => rows.map((row) => row.node.id);

const expandAll = {
  expansion: new Map<string, boolean>(),
  autoExpanded: new Set<string>(),
  defaultOpen: true,
};

/**
 * Rows as the app actually renders them: filtered through a **built index**, the way
 * `AssetTreeService.filtered` does it. Filtering without one exercises the degraded
 * literal-only path, not the shipped search — the typo tier *is* MiniSearch's bounded
 * edit distance (`asset-search.ts`).
 */
const searched = (hierarchy: AssetHierarchy, treeFilter: TreeFilter) =>
  flatten({
    hierarchy,
    ...expandAll,
    filter: treeFilter,
    filtered: filterHierarchy(hierarchy, treeFilter, { index: buildAssetIndex(hierarchy) }),
  });

describe('flatten', () => {
  it('emits collapsed roots only, and children of expanded branches', () => {
    const hierarchy = fleet();

    expect(
      ids(flatten({ hierarchy, expansion: new Map(), autoExpanded: new Set(), filter: filter() }))
    ).toEqual(['root']);

    expect(
      ids(
        flatten({
          hierarchy,
          expansion: new Map([
            ['root', true],
            ['park', true],
          ]),
          autoExpanded: new Set(),
          filter: filter(),
        })
      )
    ).toEqual(['root', 'park', 't1', 't2']);
  });

  it('reads one expansion map the same way under either default', () => {
    // The regression this guards: the drawer (`defaultOpen: false`) and the overlay
    // (`defaultOpen: true`) **share** one expansion state (AC-T3). When that state was a set
    // of ids, its meaning inverted between the two — "expanded" in one, "collapsed" in the
    // other — so opening a park in the drawer closed it in the overlay. Overrides are
    // explicit, so `park → true` has to read as open in both.
    const hierarchy = fleet();
    const expansion = new Map([
      ['root', true],
      ['park', true],
    ]);
    const shared = { expansion, autoExpanded: new Set<string>(), filter: filter() };

    expect(ids(flatten({ hierarchy, ...shared, defaultOpen: false }))).toEqual([
      'root',
      'park',
      't1',
      't2',
    ]);
    expect(ids(flatten({ hierarchy, ...shared, defaultOpen: true }))).toEqual([
      'root',
      'park',
      't1',
      't2',
    ]);

    // And the same for an explicit *close*, which under `defaultOpen: true` is the only
    // thing that can shut a branch.
    const closed = { ...shared, expansion: new Map([['park', false]]) };

    expect(ids(flatten({ hierarchy, ...closed, defaultOpen: true }))).toEqual(['root', 'park']);
  });

  it('marks the current asset and the path leading to it', () => {
    const rows = flatten({ hierarchy: fleet(), ...expandAll, filter: filter(), currentId: 't1' });

    expect(rows.find((row) => row.node.id === 't1')?.current).toBe(true);
    expect(rows.filter((row) => row.onCurrentPath).map((row) => row.node.id)).toEqual([
      'root',
      'park',
    ]);
  });

  it('draws a node referenced by two parents exactly once', () => {
    // Legal in c8y — `linkHierarchy` picks one parent, so the second reference must not
    // produce a duplicate row (which would also break `trackBy` and the row ids).
    const hierarchy = buildHierarchy(
      [mo('root', ['a', 'b']), mo('a', ['shared']), mo('b', ['shared']), turbine('shared')],
      asOf,
      LEAF
    );

    const rows = ids(searched(hierarchy, filter()));

    expect(rows.filter((id) => id === 'shared')?.length).toBe(1);
  });

  it('terminates on a childAssets cycle reachable from a root', () => {
    // root → a → b → a. Unguarded, `visit` recurses until the stack blows.
    const hierarchy = withLookupBudget(
      buildHierarchy([mo('root', ['a']), mo('a', ['b']), mo('b', ['a'])], asOf, LEAF)
    );

    const rows = ids(searched(hierarchy, filter()));

    expect(rows).toEqual(['root', 'a', 'b']);
  });

  it('terminates on a self-referencing asset', () => {
    const hierarchy = withLookupBudget(
      buildHierarchy([mo('root', ['a']), mo('a', ['a'])], asOf, LEAF)
    );

    expect(ids(searched(hierarchy, filter()))).toEqual(['root', 'a']);
  });

  it('terminates marking ancestors when the current asset sits in a cyclic parent chain', () => {
    // `a.parentId === b` and `b.parentId === a`, so the ancestor walk has no natural end.
    // The pair is unreachable from any root, so there are no rows to mark — the walk runs
    // regardless of that, which is exactly why the guard cannot live in the row loop.
    const hierarchy = withLookupBudget(
      buildHierarchy([mo('a', ['b']), mo('b', ['a'])], asOf, LEAF)
    );

    expect(flatten({ hierarchy, ...expandAll, filter: filter(), currentId: 'a' })).toEqual([]);
  });

  it('terminates marking ancestors when a rooted branch loops back onto itself', () => {
    // root → a → b → a, current = b: rows exist *and* the parent chain is cyclic, so both
    // the descent and the ancestor walk are exercised in one pass.
    const hierarchy = withLookupBudget(
      buildHierarchy([mo('root', ['a']), mo('a', ['b']), mo('b', ['a'])], asOf, LEAF)
    );

    const rows = flatten({ hierarchy, ...expandAll, filter: filter(), currentId: 'b' });

    expect(ids(rows)).toEqual(['root', 'a', 'b']);
    expect(rows.filter((row) => row.current).map((row) => row.node.id)).toEqual(['b']);
    expect(rows.filter((row) => row.onCurrentPath).map((row) => row.node.id)).toEqual([
      'root',
      'a',
    ]);
  });
});

describe('flatten — filtering', () => {
  it('keeps matches, their ancestors and their descendants', () => {
    const hierarchy = fleet();
    const rows = ids(searched(hierarchy, filter({ searchText: 'park' })));

    // The ancestor is a path segment, and matching a park must not empty the park (§3.5).
    expect(rows).toEqual(['root', 'park', 't1', 't2']);
  });

  it('drops branches with no match below them', () => {
    const hierarchy = buildHierarchy(
      [mo('root', ['park', 'other']), mo('park', ['t1']), turbine('t1'), mo('other', [])],
      asOf,
      LEAF
    );

    expect(ids(searched(hierarchy, filter({ searchText: 't1' })))).toEqual(['root', 'park', 't1']);
  });

  it('reports the matched ranges the row marks', () => {
    const hierarchy = buildHierarchy([mo('root', ['t1']), turbine('t1', 'Turbine 1')], asOf, LEAF);
    const rows = searched(hierarchy, filter({ searchText: 'urb' }));

    expect(rows.find((row) => row.node.id === 't1')?.matches).toEqual([{ start: 1, end: 4 }]);
  });
});

describe('flatten — fuzzy fallback', () => {
  /** `root → park → "WTG 12" / "Nacelle 4"`. */
  function named() {
    return buildHierarchy(
      [
        mo('root', ['park'], 'Fleet'),
        mo('park', ['t1', 't2'], 'North Park'),
        turbine('t1', 'WTG 12'),
        turbine('t2', 'Nacelle 4'),
      ],
      asOf,
      LEAF
    );
  }

  it('falls back to a subsequence match when the literal search finds nothing', () => {
    const rows = ids(searched(named(), filter({ searchText: 'wtg12' })));

    expect(rows).toContain('t1');
    expect(rows).not.toContain('t2');
  });

  it('marks the fuzzily matched characters, so the row explains itself', () => {
    const rows = searched(named(), filter({ searchText: 'wtg12' }));

    // "WTG 12" — the run "WTG" merges into one range, the space is skipped, "12" merges.
    expect(rows.find((row) => row.node.id === 't1')?.matches).toEqual([
      { start: 0, end: 3 },
      { start: 4, end: 6 },
    ]);
  });

  it('does not pull in the subtree of a fuzzily matched branch', () => {
    // "nrthpark" only matches "North Park" by subsequence. A literal branch match keeps
    // its turbines; a guessed one must not — one guessed branch dragging its whole subtree
    // back in made the filter look as though it had never run.
    const rows = ids(searched(named(), filter({ searchText: 'nrthpark' })));

    expect(rows).toEqual(['root', 'park']);
  });

  it('prefers the literal match and does not widen when one exists', () => {
    // "Nacelle 4" is a subsequence host for "nal", but "Nacelle" matches literally — a
    // literal hit anywhere must keep the fallback out of it entirely.
    const rows = ids(searched(named(), filter({ searchText: 'nacelle' })));

    expect(rows).toEqual(['root', 'park', 't2']);
  });

  it('does not fall back for a single character', () => {
    // 'z' is in no name; a one-character term must not be allowed to match by subsequence
    // either, or the fallback would return the whole fleet for most single letters.
    const rows = ids(searched(named(), filter({ searchText: 'z' })));

    expect(rows).toEqual([]);
  });

  it('still returns nothing when not even a subsequence matches', () => {
    const rows = ids(searched(named(), filter({ searchText: 'zzz' })));

    expect(rows).toEqual([]);
  });

  /** `root → "Emden" → "WTG 12"`, for the typo tier. */
  function emden() {
    return buildHierarchy(
      [mo('root', ['park'], 'Fleet'), mo('park', ['t1'], 'Emden'), turbine('t1', 'WTG 12')],
      asOf,
      LEAF
    );
  }

  it('tolerates an inserted character — "Ermden" finds "Emden"', () => {
    // The case subsequence matching cannot see: the extra `r` is not in the name, so every
    // character of the term is *not* present and tier 1 fails outright.
    const rows = ids(searched(emden(), filter({ searchText: 'Ermden' })));

    expect(rows).toContain('park');
  });

  it('tolerates a transposition and a substitution', () => {
    for (const term of ['Emedn', 'Emdem', 'Emdn']) {
      const rows = ids(searched(emden(), filter({ searchText: term })));

      expect(rows).withContext(term).toContain('park');
    }
  });

  it('marks the whole word that was close, not individual letters', () => {
    const rows = searched(emden(), filter({ searchText: 'Ermden' }));

    expect(rows.find((row) => row.node.id === 'park')?.matches).toEqual([{ start: 0, end: 5 }]);
  });

  it('matches a mistyped word inside a longer name', () => {
    const hierarchy = buildHierarchy(
      [mo('root', ['park'], 'Fleet'), mo('park', [], 'North Emden Offshore')],
      asOf,
      LEAF
    );
    const rows = searched(hierarchy, filter({ searchText: 'Ermden' }));

    // The range covers the word "Emden" where it actually sits, not the head of the name.
    expect(rows.find((row) => row.node.id === 'park')?.matches).toEqual([{ start: 6, end: 11 }]);
  });

  it('compares a multi-word term against the whole name', () => {
    const hierarchy = buildHierarchy([mo('root', [], 'North Park')], asOf, LEAF);
    const rows = ids(searched(hierarchy, filter({ searchText: 'nort prak' })));

    expect(rows).toEqual(['root']);
  });

  it('stays stingy: three characters and unrelated terms do not match', () => {
    // "emx" is one edit from "emd", which *is* in "Emden" — but below four characters the
    // approximate tier is off entirely, so it must not match. ("emd" itself is no test at
    // all: it is a literal substring, so it never reaches the fallback.)
    for (const term of ['emx', 'xyzzy', 'Hannover']) {
      const rows = ids(searched(emden(), filter({ searchText: term })));

      expect(rows).withContext(term).toEqual([]);
    }
  });

  it('does not loosen an asset-type filter', () => {
    // The type came from a tab the user clicked; only the name half is lenient.
    const rows = ids(
      flatten({
        hierarchy: named(),
        ...expandAll,
        filter: filter({ searchText: 'wtg12', assetTypes: ['wind_park'] }),
      })
    );

    expect(rows).toEqual([]);
  });
});

describe('autoExpansionFor', () => {
  it('opens the ancestors of every match, and nothing else', () => {
    const expanded = autoExpansionFor(fleet(), filter({ searchText: 't1' }));

    expect([...expanded].sort()).toEqual(['park', 'root']);
  });

  it('is empty when nothing is filtered', () => {
    expect(autoExpansionFor(fleet(), filter()).size).toBe(0);
    expect(autoExpansionFor(null, filter({ searchText: 't1' })).size).toBe(0);
  });

  it('terminates on a cyclic parent chain', () => {
    const hierarchy = withLookupBudget(
      buildHierarchy([mo('a', ['b'], 'Alpha'), mo('b', ['a'], 'Beta')], asOf, LEAF)
    );

    const expanded = autoExpansionFor(hierarchy, filter({ searchText: 'alpha' }));

    expect(expanded.size).toBeLessThanOrEqual(2);
  });
});

describe('flatten in high-volume mode', () => {
  const asOf = '2026-08-05T09:00:00.000Z';

  function hv(raw: RawManagedObject[]): AssetHierarchy {
    return buildHierarchy(raw, asOf, 'wind_turbine', null, { highVolume: true });
  }

  const park = (count: number): RawManagedObject => ({
    id: 'park',
    name: 'Park',
    type: 'wind_park',
    childAssets: { references: [], count },
  });

  it('gives an unloaded branch a twisty, so its children are reachable at all', () => {
    const rows = flatten({
      hierarchy: hv([park(114)]),
      expansion: new Map(),
      autoExpanded: new Set(),
      filter: EMPTY_TREE_FILTER,
    });

    expect(rows?.length).toBe(1);
    expect(rows[0]?.hasChildren).toBe(true);
    // Expanded state follows the container/user as usual — the twisty is what triggers the load.
    expect(rows[0]?.expanded).toBe(false);
  });

  it('does not invent a twisty for a leaf the platform says has no children', () => {
    const rows = flatten({
      hierarchy: hv([
        { id: 't1', name: 'T1', type: 'wind_turbine', childAssets: { references: [], count: 0 } },
      ]),
      expansion: new Map(),
      autoExpanded: new Set(),
      filter: EMPTY_TREE_FILTER,
    });

    expect(rows[0]?.hasChildren).toBe(false);
  });

  it('reports a branch as expanded once opened, even before its children arrive', () => {
    const rows = flatten({
      hierarchy: hv([park(114)]),
      expansion: new Map([['park', true]]),
      autoExpanded: new Set(),
      filter: EMPTY_TREE_FILTER,
    });

    // `expanded` has to be true for the caret to point down and `aria-expanded` to be honest
    // while the request is in flight.
    expect(rows[0]?.expanded).toBe(true);
  });

  it('suppresses the pending twisty while a filter is active', () => {
    // The filter only knows the loaded set, so offering to expand into unloaded children would
    // promise matches this tree cannot judge.
    const hierarchy = hv([park(114)]);
    const filter: TreeFilter = { ...EMPTY_TREE_FILTER, searchText: 'park' };
    const rows = flatten({
      hierarchy,
      expansion: new Map(),
      autoExpanded: new Set(),
      filter,
      filtered: filterHierarchy(hierarchy, filter, { index: buildAssetIndex(hierarchy) }),
    });

    expect(rows[0]?.hasChildren).toBe(false);
  });

  it('terminates on a cyclic hierarchy that also has pending branches', () => {
    const cyclic = withLookupBudget(
      hv([
        {
          id: 'a',
          name: 'A',
          type: 'wind_park',
          childAssets: { references: [{ managedObject: { id: 'b' } }], count: 2 },
        },
        {
          id: 'b',
          name: 'B',
          type: 'wind_park',
          childAssets: { references: [{ managedObject: { id: 'a' } }], count: 1 },
        },
      ])
    );

    expect(() =>
      flatten({
        hierarchy: cyclic,
        expansion: new Map(),
        autoExpanded: new Set(),
        filter: EMPTY_TREE_FILTER,
        defaultOpen: true,
      })
    ).not.toThrow();
  });
});
