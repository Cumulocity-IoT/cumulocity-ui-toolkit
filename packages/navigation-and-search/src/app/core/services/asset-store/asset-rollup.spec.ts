import { withLookupBudget } from '../../testing/lookup-budget';
import {
  buildHierarchy,
  computeRollup,
  pathOf,
  readAvailability,
  readLatestValues,
  type RawManagedObject,
} from './asset-rollup';
import {
  branchBadgeCount,
  countUnitFor,
  effectiveAvailability,
  unitCount,
} from './asset-store.model';

/**
 * `asset-rollup` is pure by design (see its module comment), so these are plain
 * function-level tests — no Angular, no DOM.
 *
 * The cycle cases are the point of much of the file. A `childAssets` cycle is not something the
 * platform prevents: an import or a mis-click can make a group a child of its own member,
 * and every walk over the hierarchy then has to terminate. It used to be possible for
 * `linkHierarchy` to produce a **cyclic `parentId` chain**, which froze the tab in the
 * tree's ancestor walks. The guards live in the walkers; these tests pin the behaviour of
 * the layer underneath them, including the fact that the cyclic chain is still built —
 * that is what the guards defend against.
 */

const asOf = '2026-07-30T12:00:00.000Z';

function mo(
  id: string,
  options: {
    name?: string;
    type?: string;
    children?: string[];
    alarms?: Record<string, number>;
    availability?: string;
  } = {}
): RawManagedObject {
  return {
    id,
    name: options.name ?? id,
    type: options.type ?? 'site',
    c8y_IsAsset: {},
    childAssets: {
      references: (options.children ?? []).map((child) => ({ managedObject: { id: child } })),
    },
    ...(options.alarms ? { c8y_ActiveAlarmsStatus: options.alarms } : {}),
    ...(options.availability ? { c8y_Availability: { status: options.availability } } : {}),
  };
}

/** A leaf asset. */
const asset = (id: string, options: Parameters<typeof mo>[1] = {}) =>
  mo(id, { ...options, type: 'machine' });

/** A plain device: `c8y_IsDevice`, no `c8y_IsAsset` — counted below its asset, never a row. */
function device(
  id: string,
  options: { availability?: string; alarms?: Record<string, number> } = {}
): RawManagedObject {
  return {
    id,
    name: id,
    type: 'c8y_Linux',
    c8y_IsDevice: {},
    ...(options.alarms ? { c8y_ActiveAlarmsStatus: options.alarms } : {}),
    ...(options.availability ? { c8y_Availability: { status: options.availability } } : {}),
  };
}

describe('readAvailability', () => {
  it('maps the platform c8y_Availability status', () => {
    expect(readAvailability(device('d', { availability: 'AVAILABLE' }))).toBe('available');
    expect(readAvailability(device('d', { availability: 'UNAVAILABLE' }))).toBe('unavailable');
    // Deliberately out of service reads as unavailable — there is no third fill.
    expect(readAvailability(device('d', { availability: 'MAINTENANCE' }))).toBe('unavailable');
  });

  it('is unknown — never a fault — when missing or unmapped', () => {
    expect(readAvailability(device('d'))).toBe('unknown');
    expect(readAvailability(device('d', { availability: 'SOMETHING' }))).toBe('unknown');
    expect(readAvailability({ id: 'x', c8y_Availability: 'AVAILABLE' })).toBe('unknown');
  });
});

describe('buildHierarchy', () => {
  it('links parents from childAssets and assigns depth from the root down', () => {
    const hierarchy = buildHierarchy(
      [mo('root', { children: ['site'] }), mo('site', { children: ['t1'] }), asset('t1')],
      asOf
    );

    expect(hierarchy.rootIds).toEqual(['root']);
    expect(hierarchy.byId.get('t1')?.parentId).toBe('site');
    expect(hierarchy.byId.get('t1')?.depth).toBe(2);
  });

  it('drops child references to assets outside the sweep', () => {
    // An asset the user cannot read is not a row we can draw, so it must not be counted.
    const hierarchy = buildHierarchy(
      [mo('site', { children: ['t1', 'invisible'] }), asset('t1')],
      asOf
    );

    expect(hierarchy.byId.get('site')?.childIds).toEqual(['t1']);
    expect(hierarchy.rollup.get('site')?.assetCount).toBe(2);
  });

  it('sorts siblings numerically, not lexically', () => {
    const hierarchy = buildHierarchy(
      [
        mo('site', { children: ['b', 'a'] }),
        asset('a', { name: 'T10' }),
        asset('b', { name: 'T2' }),
      ],
      asOf
    );

    expect(hierarchy.byId.get('site')?.childIds).toEqual(['b', 'a']);
  });

  it('terminates on a two-node childAssets cycle', () => {
    // Would previously be the *source* of the freeze: neither node is reachable from a
    // root, so the fallback pass in `linkHierarchy` points each at the other.
    const hierarchy = buildHierarchy(
      [mo('a', { children: ['b'] }), mo('b', { children: ['a'] })],
      asOf
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
      asOf
    );

    expect(hierarchy.rootIds).toEqual(['root']);
    expect(hierarchy.byId.get('a')?.parentId).toBe('root');
    expect(hierarchy.byId.get('b')?.parentId).toBe('a');
  });

  it('terminates on a self-referencing asset', () => {
    const hierarchy = buildHierarchy([mo('a', { children: ['a'] })], asOf);

    expect(hierarchy.byId.size).toBe(1);
  });

  it('preserves node identity across a poll that changed nothing', () => {
    const raw = [mo('site', { children: ['t1'] }), asset('t1', { children: ['d1'] }), device('d1')];
    const first = buildHierarchy(raw, asOf);
    const second = buildHierarchy(raw, '2026-07-30T12:00:30.000Z', first);

    // NFR-T1: a fresh object per poll would repaint every OnPush row in the viewport.
    expect(second.byId.get('t1')).toBe(first.byId.get('t1'));
    expect(second.rollup.get('site')).toBe(first.rollup.get('site'));
  });
});

describe('computeRollup', () => {
  it('counts assets and devices, and rolls alarms up every level', () => {
    const hierarchy = buildHierarchy(
      [
        mo('root', { children: ['site'] }),
        mo('site', { children: ['t1', 't2'] }),
        asset('t1', { children: ['d1'] }),
        asset('t2', { children: ['d2', 'd3'] }),
        device('d1', { alarms: { critical: 1 }, availability: 'AVAILABLE' }),
        device('d2', { availability: 'UNAVAILABLE' }),
        device('d3'),
      ],
      asOf
    );

    const root = hierarchy.rollup.get('root');

    // Assets include the node itself; devices are the attached plain devices.
    expect(root?.assetCount).toBe(4);
    expect(root?.deviceCount).toBe(3);
    expect(hierarchy.rollup.get('t2')?.deviceCount).toBe(2);
    // AC-T10: one critical alarm on one device reddens the whole path.
    expect(root?.worst).toBe('critical');
    expect(root?.alarmedDeviceCount).toBe(1);
    expect(root?.availableCount).toBe(1);
    expect(root?.unavailableCount).toBe(1);
    // Devices are attached, not drawn.
    expect(hierarchy.byId.has('d1')).toBe(false);
    expect(hierarchy.byId.get('t1')?.childIds).toEqual([]);
    expect(hierarchy.byId.get('t2')?.devices.map((d) => d.id)).toEqual(['d2', 'd3']);
  });

  it('counts an asset that is itself a device as a device, with its own availability', () => {
    const hierarchy = buildHierarchy(
      [
        mo('site', { children: ['m1'] }),
        { ...asset('m1', { availability: 'MAINTENANCE', alarms: { major: 1 } }), c8y_IsDevice: {} },
      ],
      asOf
    );

    const site = hierarchy.rollup.get('site');

    expect(site?.deviceCount).toBe(1);
    expect(site?.unavailableCount).toBe(1);
    expect(site?.alarmedDeviceCount).toBe(1);
    expect(site?.alarmedAssetCount).toBe(1);
  });

  it('counts alarmed units, not alarms', () => {
    // The regression: the summary added up `alarms.critical + alarms.major` and labelled it
    // "alarmed", so three assets carrying seven alarms between them reported seven alarmed
    // assets — out of three.
    const hierarchy = buildHierarchy(
      [
        mo('site', { children: ['t1', 't2', 't3'] }),
        asset('t1', { alarms: { critical: 4, major: 2 } }),
        asset('t2', { alarms: { major: 1 } }),
        // Minor only: not a red or orange dot, so not alarmed either.
        asset('t3', { alarms: { minor: 3 } }),
      ],
      asOf
    );

    const site = hierarchy.rollup.get('site');

    expect(site?.assetCount).toBe(4);
    expect(site?.alarmedAssetCount).toBe(2);
    expect(site?.alarms.critical + site!.alarms.major).toBe(7);
  });

  it('rolls up subtrees hanging off a cycle, whatever order the sweep returned them in', () => {
    // Nothing is reachable from a root here: `a` and `b` reference each other, so neither is
    // parentless, and `t1` hangs off `b`. That is the only way into the orphan pass — and it
    // used to append those nodes **flat, in `byId` order**, into a list the reduction reads
    // backwards. With the sweep's `_id` ordering putting `t1` first, `b` was then reduced
    // before `t1` existed and quietly lost its asset and its alarm.
    const hierarchy = withLookupBudget(
      buildHierarchy(
        [
          asset('t1', { alarms: { major: 2 } }),
          mo('a', { children: ['b'] }),
          mo('b', { children: ['a', 't1'] }),
        ],
        asOf
      )
    );

    expect(hierarchy.rootIds).toEqual([]);

    const rollup = computeRollup(hierarchy.byId, hierarchy.rootIds);

    expect(rollup.get('b')?.assetCount).toBe(2);
    expect(rollup.get('b')?.alarms.major).toBe(2);
    expect(rollup.get('b')?.worst).toBe('major');
  });

  it('terminates on a cyclic hierarchy', () => {
    const hierarchy = withLookupBudget(
      buildHierarchy(
        [mo('a', { children: ['b'] }), mo('b', { children: ['a'] }), asset('t1')],
        asOf
      )
    );

    // Every node gets a rollup, cycle or not — the tree renders from these.
    expect(computeRollup(hierarchy.byId, hierarchy.rootIds).size).toBe(3);
  });
});

describe('pathOf', () => {
  it('returns root → node inclusive', () => {
    const hierarchy = buildHierarchy(
      [mo('root', { children: ['site'] }), mo('site', { children: ['t1'] }), asset('t1')],
      asOf
    );

    expect(pathOf(hierarchy, 't1').map((node) => node.id)).toEqual(['root', 'site', 't1']);
  });

  it('terminates on a cyclic parent chain', () => {
    // a.parentId === b and b.parentId === a: unguarded this walks forever, and the walk is
    // synchronous — hence the lookup budget rather than a test timeout (see the helper).
    const hierarchy = withLookupBudget(
      buildHierarchy([mo('a', { children: ['b'] }), mo('b', { children: ['a'] })], asOf)
    );

    const path = pathOf(hierarchy, 'a').map((node) => node.id);

    expect(path?.length).toBe(2);
    expect(new Set(path).size).toBe(2);
  });

  it('is empty for an id the sweep does not carry', () => {
    expect(pathOf(buildHierarchy([mo('a')], asOf), 'nope')).toEqual([]);
    expect(pathOf(null, 'a')).toEqual([]);
  });
});

describe('high-volume mode', () => {
  const site = (count: number, children: string[] = []): RawManagedObject => ({
    id: 'site',
    name: 'Site',
    type: 'site',
    childAssets: { references: children.map((id) => ({ managedObject: { id } })), count },
  });

  it('keeps pendingChildren empty in full mode, so an unreadable asset never grows a twisty', () => {
    // An unresolvable reference in `full` mode means "you may not see that asset" — a permission
    // fact, not a loading state. Offering to expand it would invite a request that returns nothing.
    const hierarchy = buildHierarchy([mo('site', { children: ['hidden'] })], asOf);

    expect(hierarchy.mode).toBe('full');
    expect(hierarchy.pendingChildren.size).toBe(0);
    expect(hierarchy.rollup.get('site')?.partial).toBeUndefined();
  });

  it('flags a branch pending when the platform count exceeds what is loaded', () => {
    const hierarchy = buildHierarchy([site(114)], asOf, null, { highVolume: true });

    expect(hierarchy.pendingChildren.has('site')).toBe(true);
  });

  it('clears the flag once every child is loaded', () => {
    const hierarchy = buildHierarchy(
      [site(2, ['t1', 't2']), asset('t1'), asset('t2')],
      asOf,
      null,
      { highVolume: true }
    );

    expect(hierarchy.pendingChildren.has('site')).toBe(false);
    expect(hierarchy.rollup.get('site')?.assetCount).toBe(3);
    expect(hierarchy.rollup.get('site')?.partial).toBeUndefined();
  });

  it('falls back to unresolved references when the platform sent no count', () => {
    const hierarchy = buildHierarchy([mo('site', { children: ['t1'] })], asOf, null, {
      highVolume: true,
    });

    expect(hierarchy.pendingChildren.has('site')).toBe(true);
  });

  it('counts attached devices as loaded children', () => {
    const hierarchy = buildHierarchy(
      [site(2, ['t1', 'd1']), asset('t1'), device('d1')],
      asOf,
      null,
      {
        highVolume: true,
      }
    );

    expect(hierarchy.pendingChildren.has('site')).toBe(false);
  });

  it("narrows worst to the node's own severity while the subtree is incomplete", () => {
    // The site itself is clean and its one loaded asset is minor, but 499 assets are unread —
    // reporting "minor" would be a claim about data nobody has fetched.
    const hierarchy = buildHierarchy(
      [site(500, ['t1']), asset('t1', { alarms: { minor: 1 } })],
      asOf,
      null,
      { highVolume: true }
    );

    const rollup = hierarchy.rollup.get('site');

    expect(rollup?.partial).toBe(true);
    expect(rollup?.worst).toBeNull();
    // The loaded asset still speaks for itself.
    expect(hierarchy.rollup.get('t1')?.worst).toBe('minor');
  });

  it("keeps a partial branch's own alarms as its severity", () => {
    const hierarchy = buildHierarchy(
      [{ ...site(500), c8y_ActiveAlarmsStatus: { major: 2 } }],
      asOf,
      null,
      { highVolume: true }
    );

    expect(hierarchy.rollup.get('site')?.worst).toBe('major');
    expect(hierarchy.rollup.get('site')?.partial).toBe(true);
  });

  it('propagates incompleteness to every ancestor', () => {
    // A region cannot claim a subtree total when a site two levels down is half-read.
    const hierarchy = buildHierarchy(
      [
        mo('region', { children: ['area'], type: 'region' }),
        mo('area', { children: ['site'], type: 'area' }),
        site(500, ['t1']),
        asset('t1'),
      ],
      asOf,
      null,
      { highVolume: true }
    );

    expect(hierarchy.rollup.get('site')?.partial).toBe(true);
    expect(hierarchy.rollup.get('area')?.partial).toBe(true);
    expect(hierarchy.rollup.get('region')?.partial).toBe(true);
  });

  it('leaves a fully loaded sibling subtree complete', () => {
    const loadedSite: RawManagedObject = {
      id: 'full',
      name: 'full',
      type: 'site',
      childAssets: { references: [{ managedObject: { id: 't1' } }], count: 1 },
    };
    const unloadedSite: RawManagedObject = {
      id: 'partial',
      name: 'partial',
      type: 'site',
      childAssets: { references: [], count: 9 },
    };
    const hierarchy = buildHierarchy(
      [
        mo('region', { children: ['full', 'partial'], type: 'region' }),
        loadedSite,
        unloadedSite,
        asset('t1', { alarms: { critical: 1 } }),
      ],
      asOf,
      null,
      { highVolume: true }
    );

    expect(hierarchy.rollup.get('full')?.partial).toBeUndefined();
    expect(hierarchy.rollup.get('full')?.worst).toBe('critical');
    expect(hierarchy.rollup.get('partial')?.partial).toBe(true);
    // The region inherits the gap from the incomplete site.
    expect(hierarchy.rollup.get('region')?.partial).toBe(true);
  });
});

describe('count units', () => {
  const hierarchy = buildHierarchy(
    [
      mo('site', { children: ['t1', 't2'] }),
      asset('t1', { children: ['d1'] }),
      asset('t2', { children: ['d2'] }),
      device('d1', { availability: 'UNAVAILABLE' }),
      device('d2', { availability: 'AVAILABLE' }),
    ],
    asOf
  );
  const site = hierarchy.rollup.get('site')!;

  it('counts assets with the DTM and devices otherwise — devices while DTM is unknown', () => {
    expect(countUnitFor(true)).toBe('assets');
    expect(countUnitFor(false)).toBe('devices');
    expect(countUnitFor(null)).toBe('devices');
    expect(unitCount(site, 'assets')).toBe(3);
    expect(unitCount(site, 'devices')).toBe(2);
  });

  it('badges a branch with its descendants', () => {
    expect(branchBadgeCount(site, 'assets')).toBe(2);
    expect(branchBadgeCount(site, 'devices')).toBe(2);
  });

  it("derives an asset's availability from its devices", () => {
    const t1 = hierarchy.byId.get('t1')!;
    const t2 = hierarchy.byId.get('t2')!;

    expect(effectiveAvailability(t1, hierarchy.rollup.get('t1')!)).toBe('unavailable');
    expect(effectiveAvailability(t2, hierarchy.rollup.get('t2')!)).toBe('available');
    expect(effectiveAvailability(hierarchy.byId.get('site')!, site)).toBe('unavailable');
  });
});

describe('latest measurement values', () => {
  const latest = (values: Record<string, Record<string, unknown>>) => ({
    c8y_LatestMeasurements: values,
  });

  it('reads c8y_LatestMeasurements into numeric values by series', () => {
    expect(
      readLatestValues({
        c8y_Temperature: { T: { value: 21.5, unit: '°C' } },
        CPU: { Usage: { value: 12 }, Load: { value: 0.5 } },
      })
    ).toEqual({ 'c8y_Temperature.T': 21.5, 'CPU.Usage': 12, 'CPU.Load': 0.5 });
  });

  it('skips non-numeric readings and malformed series, and is empty when missing', () => {
    expect(
      readLatestValues({
        a: { text: { value: 'on' }, nan: { value: NaN }, none: null, bare: 3 },
        b: 'not a series',
        c: null,
      })
    ).toEqual({});
    expect(readLatestValues(undefined)).toEqual({});
    expect(readLatestValues('x')).toEqual({});
  });

  it('carries the latest values on the devices built from the sweep, and none without', () => {
    const hierarchy = buildHierarchy(
      [
        mo('site', { children: ['t1'] }),
        asset('t1', { children: ['d1', 'd2'] }),
        { ...device('d1'), ...latest({ c8y_Power: { P: { value: 7 } } }) },
        device('d2'),
      ],
      asOf
    );
    const [d1, d2] = hierarchy.byId.get('t1')!.devices;

    expect(d1.latest).toEqual({ 'c8y_Power.P': 7 });
    expect(d2.latest).toBeUndefined();
  });

  it("repaints an asset whose device's or own latest value changed — and only then", () => {
    // Every sweep returns fresh objects with an unchanged `lastUpdated`, as the platform does.
    const sweep = (deviceValue: number, assetValue: number) =>
      [
        mo('site', { children: ['t1', 't2'] }),
        asset('t1', { children: ['d1'] }),
        { ...asset('t2'), ...latest({ c8y_Speed: { V: { value: assetValue } } }) },
        { ...device('d1'), ...latest({ c8y_Power: { P: { value: deviceValue } } }) },
      ].map((raw) => ({ ...raw, lastUpdated: asOf }));
    const first = buildHierarchy(sweep(7, 3), asOf);
    const same = buildHierarchy(sweep(7, 3), asOf, first);

    expect(same.byId.get('t1')).toBe(first.byId.get('t1'));
    expect(same.byId.get('t2')).toBe(first.byId.get('t2'));

    // a new measurement does not touch the device's `lastUpdated`: compared by value
    const deviceChanged = buildHierarchy(sweep(8, 3), asOf, same);

    expect(deviceChanged.byId.get('t1')).not.toBe(same.byId.get('t1'));
    expect(deviceChanged.byId.get('t1')!.devices[0].latest).toEqual({ 'c8y_Power.P': 8 });
    expect(deviceChanged.byId.get('t2')).toBe(same.byId.get('t2'));

    const assetChanged = buildHierarchy(sweep(8, 4), asOf, deviceChanged);

    expect(assetChanged.byId.get('t2')).not.toBe(deviceChanged.byId.get('t2'));
    expect(assetChanged.byId.get('t1')).toBe(deviceChanged.byId.get('t1'));
  });
});
