import { withLookupBudget } from '../../testing/lookup-budget';
import { buildHierarchy, computeRollup, pathOf, type RawManagedObject } from './asset-rollup';

/**
 * `asset-rollup` is pure by design (see its module comment), so these are plain
 * function-level tests — no Angular, no DOM.
 *
 * The cycle cases are the point of the file. A `childAssets` cycle is not something the
 * platform prevents: an import or a mis-click can make a park a child of its own turbine,
 * and every walk over the hierarchy then has to terminate. It used to be possible for
 * `linkHierarchy` to produce a **cyclic `parentId` chain**, which froze the tab in the
 * tree's ancestor walks. The guards live in the walkers; these tests pin the behaviour of
 * the layer underneath them, including the fact that the cyclic chain is still built —
 * that is what the guards defend against.
 */

const asOf = '2026-07-30T12:00:00.000Z';
const LEAF = 'wind_turbine';

function mo(
  id: string,
  options: {
    name?: string;
    type?: string;
    children?: string[];
    alarms?: Record<string, number>;
    turbineState?: number;
  } = {}
): RawManagedObject {
  return {
    id,
    name: options.name ?? id,
    type: options.type ?? 'wind_park',
    childAssets: {
      references: (options.children ?? []).map((child) => ({ managedObject: { id: child } })),
    },
    ...(options.alarms ? { c8y_ActiveAlarmsStatus: options.alarms } : {}),
    ...(options.turbineState === undefined
      ? {}
      : { wnd_Status: { 'WTUR.TurSt': options.turbineState } }),
  };
}

const turbine = (id: string, options: Parameters<typeof mo>[1] = {}) =>
  mo(id, { ...options, type: LEAF });

describe('buildHierarchy', () => {
  it('links parents from childAssets and assigns depth from the root down', () => {
    const hierarchy = buildHierarchy(
      [mo('root', { children: ['park'] }), mo('park', { children: ['t1'] }), turbine('t1')],
      asOf,
      LEAF
    );

    expect(hierarchy.rootIds).toEqual(['root']);
    expect(hierarchy.byId.get('t1')?.parentId).toBe('park');
    expect(hierarchy.byId.get('t1')?.depth).toBe(2);
  });

  it('drops child references to assets outside the sweep', () => {
    // A turbine the user cannot read is not a row we can draw, so it must not be counted.
    const hierarchy = buildHierarchy(
      [mo('park', { children: ['t1', 'invisible'] }), turbine('t1')],
      asOf,
      LEAF
    );

    expect(hierarchy.byId.get('park')?.childIds).toEqual(['t1']);
    expect(hierarchy.rollup.get('park')?.turbineCount).toBe(1);
  });

  it('sorts siblings numerically, not lexically', () => {
    const hierarchy = buildHierarchy(
      [
        mo('park', { children: ['b', 'a'] }),
        turbine('a', { name: 'T10' }),
        turbine('b', { name: 'T2' }),
      ],
      asOf,
      LEAF
    );

    expect(hierarchy.byId.get('park')?.childIds).toEqual(['b', 'a']);
  });

  it('terminates on a two-node childAssets cycle', () => {
    // Would previously be the *source* of the freeze: neither node is reachable from a
    // root, so the fallback pass in `linkHierarchy` points each at the other.
    const hierarchy = buildHierarchy(
      [mo('a', { children: ['b'] }), mo('b', { children: ['a'] })],
      asOf,
      LEAF
    );

    expect(hierarchy.byId.size).toBe(2);
    // The cyclic parent chain this produces is exactly what the tree's walkers guard
    // against — asserted here so a change in either place is visible in the other's tests.
    expect(hierarchy.byId.get('a')?.parentId).toBe('b');
    expect(hierarchy.byId.get('b')?.parentId).toBe('a');
  });

  it('terminates when a cycle is reachable from a root', () => {
    const hierarchy = buildHierarchy(
      [mo('root', { children: ['a'] }), mo('a', { children: ['b'] }), mo('b', { children: ['a'] })],
      asOf,
      LEAF
    );

    expect(hierarchy.rootIds).toEqual(['root']);
    expect(hierarchy.byId.get('a')?.parentId).toBe('root');
    expect(hierarchy.byId.get('b')?.parentId).toBe('a');
  });

  it('terminates on a self-referencing asset', () => {
    const hierarchy = buildHierarchy([mo('a', { children: ['a'] })], asOf, LEAF);

    expect(hierarchy.byId.size).toBe(1);
  });

  it('preserves node identity across a poll that changed nothing', () => {
    const raw = [mo('park', { children: ['t1'] }), turbine('t1')];
    const first = buildHierarchy(raw, asOf, LEAF);
    const second = buildHierarchy(raw, '2026-07-30T12:00:30.000Z', LEAF, first);

    // NFR-T1: a fresh object per poll would repaint every OnPush row in the viewport.
    expect(second.byId.get('t1')).toBe(first.byId.get('t1'));
    expect(second.rollup.get('park')).toBe(first.rollup.get('park'));
  });
});

describe('computeRollup', () => {
  it('rolls alarms and turbine counts up every level', () => {
    const hierarchy = buildHierarchy(
      [
        mo('root', { children: ['park'] }),
        mo('park', { children: ['t1', 't2'] }),
        turbine('t1', { alarms: { critical: 1 } }),
        turbine('t2', { turbineState: 1 }),
      ],
      asOf,
      LEAF
    );

    const root = hierarchy.rollup.get('root');

    expect(root?.turbineCount).toBe(2);
    // AC-T10: one critical alarm on one turbine reddens the whole path.
    expect(root?.worst).toBe('critical');
    expect(root?.unavailableCount).toBe(1);
  });

  it('counts alarmed turbines as assets, not as alarms', () => {
    // The regression: the fleet summary added up `alarms.critical + alarms.major` and
    // labelled it "turbines with alarms", so three turbines carrying seven alarms between
    // them reported seven alarmed turbines — out of a three-turbine fleet.
    const hierarchy = buildHierarchy(
      [
        mo('park', { children: ['t1', 't2', 't3'] }),
        turbine('t1', { alarms: { critical: 4, major: 2 } }),
        turbine('t2', { alarms: { major: 1 } }),
        // Minor only: not a red or orange dot, so not an alarmed turbine either.
        turbine('t3', { alarms: { minor: 3 } }),
      ],
      asOf,
      LEAF
    );

    const park = hierarchy.rollup.get('park');

    expect(park?.turbineCount).toBe(3);
    expect(park?.alarmedCount).toBe(2);
    expect(park?.alarms.critical + park!.alarms.major).toBe(7);
  });

  it('rolls up subtrees hanging off a cycle, whatever order the sweep returned them in', () => {
    // Nothing is reachable from a root here: `a` and `b` reference each other, so neither is
    // parentless, and `t1` hangs off `b`. That is the only way into the orphan pass — and it
    // used to append those nodes **flat, in `byId` order**, into a list the reduction reads
    // backwards. With the sweep's `_id` ordering putting `t1` first, `b` was then reduced
    // before `t1` existed and quietly lost its turbine and its alarm.
    const hierarchy = withLookupBudget(
      buildHierarchy(
        [
          turbine('t1', { alarms: { major: 2 } }),
          mo('a', { children: ['b'] }),
          mo('b', { children: ['a', 't1'] }),
        ],
        asOf,
        LEAF
      )
    );

    expect(hierarchy.rootIds).toEqual([]);

    const rollup = computeRollup(hierarchy.byId, hierarchy.rootIds, LEAF);

    expect(rollup.get('b')?.turbineCount).toBe(1);
    expect(rollup.get('b')?.alarms.major).toBe(2);
    expect(rollup.get('b')?.worst).toBe('major');
  });

  it('terminates on a cyclic hierarchy', () => {
    const hierarchy = withLookupBudget(
      buildHierarchy(
        [mo('a', { children: ['b'] }), mo('b', { children: ['a'] }), turbine('t1')],
        asOf,
        LEAF
      )
    );

    // Every node gets a rollup, cycle or not — the tree renders from these.
    expect(computeRollup(hierarchy.byId, hierarchy.rootIds, LEAF).size).toBe(3);
  });
});

describe('pathOf', () => {
  it('returns root → node inclusive', () => {
    const hierarchy = buildHierarchy(
      [mo('root', { children: ['park'] }), mo('park', { children: ['t1'] }), turbine('t1')],
      asOf,
      LEAF
    );

    expect(pathOf(hierarchy, 't1').map((node) => node.id)).toEqual(['root', 'park', 't1']);
  });

  it('terminates on a cyclic parent chain', () => {
    // a.parentId === b and b.parentId === a: unguarded this walks forever, and the walk is
    // synchronous — hence the lookup budget rather than a test timeout (see the helper).
    const hierarchy = withLookupBudget(
      buildHierarchy([mo('a', { children: ['b'] }), mo('b', { children: ['a'] })], asOf, LEAF)
    );

    const path = pathOf(hierarchy, 'a').map((node) => node.id);

    expect(path?.length).toBe(2);
    expect(new Set(path).size).toBe(2);
  });

  it('is empty for an id the sweep does not carry', () => {
    expect(pathOf(buildHierarchy([mo('a')], asOf, LEAF), 'nope')).toEqual([]);
    expect(pathOf(null, 'a')).toEqual([]);
  });
});

describe('high-volume mode', () => {
  const park = (count: number, children: string[] = []): RawManagedObject => ({
    id: 'park',
    name: 'Park',
    type: 'wind_park',
    childAssets: { references: children.map((id) => ({ managedObject: { id } })), count },
  });

  it('keeps pendingChildren empty in full mode, so an unreadable asset never grows a twisty', () => {
    // An unresolvable reference in `full` mode means "you may not see that asset" — a permission
    // fact, not a loading state. Offering to expand it would invite a request that returns nothing.
    const hierarchy = buildHierarchy([mo('park', { children: ['hidden'] })], asOf, LEAF);

    expect(hierarchy.mode).toBe('full');
    expect(hierarchy.pendingChildren.size).toBe(0);
    expect(hierarchy.rollup.get('park')?.partial).toBeUndefined();
  });

  it('flags a branch pending when the platform count exceeds what is loaded', () => {
    const hierarchy = buildHierarchy([park(114)], asOf, LEAF, null, { highVolume: true });

    expect(hierarchy.pendingChildren.has('park')).toBe(true);
  });

  it('clears the flag once every child is loaded', () => {
    const hierarchy = buildHierarchy(
      [park(2, ['t1', 't2']), turbine('t1'), turbine('t2')],
      asOf,
      LEAF,
      null,
      { highVolume: true }
    );

    expect(hierarchy.pendingChildren.has('park')).toBe(false);
    expect(hierarchy.rollup.get('park')?.turbineCount).toBe(2);
    expect(hierarchy.rollup.get('park')?.partial).toBeUndefined();
  });

  it('falls back to unresolved references when the platform sent no count', () => {
    const hierarchy = buildHierarchy([mo('park', { children: ['t1'] })], asOf, LEAF, null, {
      highVolume: true,
    });

    expect(hierarchy.pendingChildren.has('park')).toBe(true);
  });

  it("narrows worst to the node's own severity while the subtree is incomplete", () => {
    // The park itself is clean and its one loaded turbine is minor, but 499 turbines are unread —
    // reporting "minor" would be a claim about data nobody has fetched.
    const hierarchy = buildHierarchy(
      [park(500, ['t1']), turbine('t1', { alarms: { minor: 1 } })],
      asOf,
      LEAF,
      null,
      { highVolume: true }
    );

    const rollup = hierarchy.rollup.get('park');

    expect(rollup?.partial).toBe(true);
    expect(rollup?.worst).toBeNull();
    // The loaded turbine still speaks for itself.
    expect(hierarchy.rollup.get('t1')?.worst).toBe('minor');
  });

  it("keeps a partial branch's own alarms as its severity", () => {
    const hierarchy = buildHierarchy(
      [{ ...park(500), c8y_ActiveAlarmsStatus: { major: 2 } }],
      asOf,
      LEAF,
      null,
      { highVolume: true }
    );

    expect(hierarchy.rollup.get('park')?.worst).toBe('major');
    expect(hierarchy.rollup.get('park')?.partial).toBe(true);
  });

  it('propagates incompleteness to every ancestor', () => {
    // A region cannot claim a subtree total when a park three levels down is half-read.
    const hierarchy = buildHierarchy(
      [
        mo('region', { children: ['area'], type: 'wind_service_region' }),
        mo('area', { children: ['park'], type: 'wind_service_area' }),
        park(500, ['t1']),
        turbine('t1'),
      ],
      asOf,
      LEAF,
      null,
      { highVolume: true }
    );

    expect(hierarchy.rollup.get('park')?.partial).toBe(true);
    expect(hierarchy.rollup.get('area')?.partial).toBe(true);
    expect(hierarchy.rollup.get('region')?.partial).toBe(true);
  });

  it('leaves a fully loaded sibling subtree complete', () => {
    const loadedPark: RawManagedObject = {
      id: 'full',
      name: 'full',
      type: 'wind_park',
      childAssets: { references: [{ managedObject: { id: 't1' } }], count: 1 },
    };
    const unloadedPark: RawManagedObject = {
      id: 'partial',
      name: 'partial',
      type: 'wind_park',
      childAssets: { references: [], count: 9 },
    };
    const hierarchy = buildHierarchy(
      [
        mo('region', { children: ['full', 'partial'], type: 'wind_service_region' }),
        loadedPark,
        unloadedPark,
        turbine('t1', { alarms: { critical: 1 } }),
      ],
      asOf,
      LEAF,
      null,
      { highVolume: true }
    );

    expect(hierarchy.rollup.get('full')?.partial).toBeUndefined();
    expect(hierarchy.rollup.get('full')?.worst).toBe('critical');
    expect(hierarchy.rollup.get('partial')?.partial).toBe(true);
    // The region inherits the gap from the incomplete park.
    expect(hierarchy.rollup.get('region')?.partial).toBe(true);
  });
});
