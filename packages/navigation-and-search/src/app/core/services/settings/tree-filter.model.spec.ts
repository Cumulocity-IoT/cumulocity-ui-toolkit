import type { AlarmCounts, AssetHierarchy, AssetNode } from '../asset-store/asset-store.model';
import { computeRollup } from '../asset-store/asset-rollup';
import {
  applyTreeFilter,
  defaultTreeFilter,
  normalizeTreeFilter,
  treeFilterActive,
  type TreeFilterCondition,
  type TreeFilterConfig,
} from './tree-filter.model';

const NO_ALARMS: AlarmCounts = { critical: 0, major: 0, minor: 0, warning: 0 };

function node(
  id: string,
  type: string,
  childIds: string[],
  extra: Partial<AssetNode> = {}
): AssetNode {
  return {
    id,
    name: id,
    type,
    parentId: null,
    childIds,
    depth: 0,
    alarms: NO_ALARMS,
    availability: 'unknown',
    isDevice: false,
    devices: [],
    properties: {},
    ...extra,
  };
}

/**
 * north (region)          south (region)
 * ├─ farmW  area West     └─ farmE  area East, capacity 50
 * │  └─ t1  major alarm      └─ t3  unavailable device
 * └─ farmN  area North
 *    └─ t2
 */
function fleet(): AssetHierarchy {
  const nodes = [
    node('north', 'region', ['farmW', 'farmN']),
    node('south', 'region', ['farmE']),
    node('farmW', 'farm', ['t1'], { properties: { area: 'West', capacity: 120 } }),
    node('farmN', 'farm', ['t2'], { properties: { area: 'North', capacity: '80' } }),
    node('farmE', 'farm', ['t3'], { properties: { area: 'East', capacity: { value: 50 } } }),
    node('t1', 'turbine', [], { alarms: { ...NO_ALARMS, major: 1 } }),
    node('t2', 'turbine', [], { alarms: { ...NO_ALARMS, warning: 2 } }),
    node('t3', 'turbine', [], {
      devices: [
        { id: 'd3', name: 'd3', type: 'ctrl', availability: 'unavailable', alarms: NO_ALARMS },
      ],
    }),
  ];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const rootIds = ['north', 'south'];

  return {
    byId,
    rootIds,
    rollup: computeRollup(byId, rootIds),
    asOf: '2026-10-30T00:00:00Z',
    mode: 'full',
    pendingChildren: new Set(),
  };
}

const filter = (conditions: TreeFilterCondition[], extra: Partial<TreeFilterConfig> = {}) => ({
  ...defaultTreeFilter(),
  conditions,
  ...extra,
});

const visible = (config: TreeFilterConfig) =>
  [...(applyTreeFilter(fleet(), config)?.hierarchy.byId.keys() ?? fleet().byId.keys())].sort();

describe('the tree filter', () => {
  it('is inactive without conditions or when switched off', () => {
    expect(applyTreeFilter(fleet(), defaultTreeFilter())).toBeNull();
    const off = filter([{ type: 'farm', test: { kind: 'unavailable' } }], { enabled: false });

    expect(treeFilterActive(off)).toBeFalse();
    expect(applyTreeFilter(fleet(), off)).toBeNull();
  });

  it('keeps the assets of a type whose property matches, with their subtree, and empties out the rest', () => {
    const config = filter([
      { type: 'farm', test: { kind: 'property', path: 'area', op: 'equals', value: 'west' } },
    ]);

    // south lost its only farm and goes with it
    expect(visible(config)).toEqual(['farmW', 'north', 't1']);
    expect(applyTreeFilter(fleet(), config)?.hidden).toBe(5);
  });

  it('keeps emptied groups when asked to', () => {
    const config = filter(
      [{ type: 'farm', test: { kind: 'property', path: 'area', op: 'equals', value: 'West' } }],
      { hideEmpty: false }
    );

    expect(visible(config)).toEqual(['farmW', 'north', 'south', 't1']);
  });

  it('tests alarms on the whole subtree, at the given severity or worse', () => {
    expect(visible(filter([{ type: 'farm', test: { kind: 'alarms', atLeast: 'major' } }]))).toEqual(
      ['farmW', 'north', 't1']
    );
    expect(
      visible(filter([{ type: 'farm', test: { kind: 'alarms', atLeast: 'warning' } }]))
    ).toEqual(['farmN', 'farmW', 'north', 't1', 't2']);
  });

  it('finds unavailable devices below an asset', () => {
    expect(visible(filter([{ type: 'region', test: { kind: 'unavailable' } }]))).toEqual([
      'farmE',
      'south',
      't3',
    ]);
  });

  it('combines conditions with AND, and compares numbers stored as numbers, strings or { value }', () => {
    expect(
      visible(
        filter([
          { type: 'farm', test: { kind: 'property', path: 'capacity', op: 'gt', value: '60' } },
          {
            type: 'farm',
            test: { kind: 'property', path: 'area', op: 'notEquals', value: 'north' },
          },
        ])
      )
    ).toEqual(['farmW', 'north', 't1']);
    expect(
      visible(
        filter([
          { type: 'farm', test: { kind: 'property', path: 'capacity', op: 'lt', value: '60' } },
        ])
      )
    ).toEqual(['farmE', 'south', 't3']);
  });

  it('recomputes the rollup over what is left', () => {
    const config = filter([
      { type: 'turbine', test: { kind: 'property', path: 'missing', op: 'exists' } },
    ]);
    const result = applyTreeFilter(fleet(), { ...config, hideEmpty: false })!;

    expect(result.hierarchy.byId.get('farmW')?.childIds).toEqual([]);
    expect(result.hierarchy.rollup.get('north')?.alarms.major).toBe(0);
  });

  describe('stored data', () => {
    it('keeps valid conditions and drops malformed ones', () => {
      const config = normalizeTreeFilter({
        version: 1,
        enabled: false,
        hideEmpty: false,
        conditions: [
          { type: 'farm', test: { kind: 'property', path: 'area', op: 'equals', value: 'West' } },
          { type: 'farm', test: { kind: 'property', path: 'area', op: 'like', value: 'W' } },
          { type: 'farm', test: { kind: 'property', path: 'a b', op: 'exists' } },
          { type: 'farm', test: { kind: 'alarms', atLeast: 'fatal' } },
          { type: '', test: { kind: 'unavailable' } },
          { type: 'site', test: { kind: 'alarms', atLeast: 'major' } },
        ],
      });

      expect(config.enabled).toBeFalse();
      expect(config.hideEmpty).toBeFalse();
      expect(config.conditions).toEqual([
        { type: 'farm', test: { kind: 'property', path: 'area', op: 'equals', value: 'West' } },
        { type: 'site', test: { kind: 'alarms', atLeast: 'major' } },
      ]);
    });

    it('falls back to an empty, enabled filter', () => {
      expect(normalizeTreeFilter(null)).toEqual(defaultTreeFilter());
      expect(normalizeTreeFilter({ version: 2 })).toEqual(defaultTreeFilter());
    });
  });
});
