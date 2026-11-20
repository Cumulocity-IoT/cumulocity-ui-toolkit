import type {
  AlarmCounts,
  AssetHierarchy,
  AssetNode,
  AttachedDevice,
} from '../asset-store/asset-store.model';
import {
  computeMetric,
  defaultRollups,
  dotSeverity,
  needsLatestValues,
  normalizeRollups,
  readNumber,
  rollupFieldId,
  rollupsForType,
} from './rollup.model';

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

function device(id: string, extra: Partial<AttachedDevice> = {}): AttachedDevice {
  return {
    id,
    name: id,
    type: 'controller',
    availability: 'available',
    alarms: NO_ALARMS,
    ...extra,
  };
}

/**
 * site
 * ├─ farmA (capacity 100)
 * │  ├─ t1 (power 5, 1 major alarm; controller unavailable, 2 minor, T=20)
 * │  └─ t2 (power 7; controller available, T=30)
 * └─ farmB (capacity "50")
 *    └─ t3 (no power; no devices)
 */
function fleet(): AssetHierarchy {
  const nodes = [
    node('site', 'site', ['farmA', 'farmB']),
    node('farmA', 'farm', ['t1', 't2'], { properties: { capacity: 100 } }),
    node('farmB', 'farm', ['t3'], { properties: { capacity: '50' } }),
    node('t1', 'turbine', [], {
      alarms: { ...NO_ALARMS, major: 1 },
      properties: { power: { value: 5, unit: 'MW' } },
      devices: [
        device('d1', {
          availability: 'unavailable',
          alarms: { ...NO_ALARMS, minor: 2 },
          latest: { 'c8y_Temperature.T': 20 },
        }),
      ],
    }),
    node('t2', 'turbine', [], {
      properties: { power: 7 },
      devices: [device('d2', { latest: { 'c8y_Temperature.T': 30 } })],
    }),
    node('t3', 'turbine', []),
  ];

  return {
    byId: new Map(nodes.map((n) => [n.id, n])),
    rootIds: ['site'],
    rollup: new Map(),
    asOf: '2026-10-30T00:00:00Z',
    mode: 'full',
    pendingChildren: new Set(),
  };
}

describe('rollups', () => {
  const value = (
    metric: Parameters<typeof computeMetric>[1],
    id: string,
    unit?: 'assets' | 'devices'
  ) => computeMetric(fleet(), metric, unit).get(id);

  it('counts the assets below a branch, optionally of one type, and the devices in it', () => {
    expect(value({ kind: 'count', of: 'assets' }, 'site')?.value).toBe(5);
    expect(value({ kind: 'count', of: 'assets', type: 'turbine' }, 'site')?.value).toBe(3);
    expect(value({ kind: 'count', of: 'assets' }, 'farmA')?.value).toBe(2);
    expect(value({ kind: 'count', of: 'devices' }, 'site')?.value).toBe(2);
    // `units` follows the tree's count unit
    expect(value({ kind: 'count', of: 'units' }, 'site', 'assets')?.value).toBe(5);
    expect(value({ kind: 'count', of: 'units' }, 'site', 'devices')?.value).toBe(2);
  });

  it('counts devices by availability, with the total for a ratio', () => {
    expect(value({ kind: 'availability', state: 'available' }, 'site')).toEqual({
      value: 1,
      of: 2,
    });
    expect(value({ kind: 'availability', state: 'unavailable' }, 'farmB')).toEqual({
      value: 0,
      of: 0,
    });
  });

  it('sums active alarms of the chosen severities, with the per-severity breakdown', () => {
    const all = value(
      { kind: 'alarms', severities: ['critical', 'major', 'minor', 'warning'] },
      'site'
    );

    expect(all?.value).toBe(3);
    expect(all?.alarms).toEqual({ critical: 0, major: 1, minor: 2, warning: 0 });
    expect(value({ kind: 'alarms', severities: ['critical', 'major'] }, 'site')?.value).toBe(1);
  });

  it('counts alarmed assets and alarmed devices separately', () => {
    expect(value({ kind: 'alarmed', of: 'assets', severities: ['major'] }, 'site')?.value).toBe(1);
    expect(value({ kind: 'alarmed', of: 'devices', severities: ['major'] }, 'site')?.value).toBe(0);
    expect(value({ kind: 'alarmed', of: 'devices', severities: ['minor'] }, 'site')?.value).toBe(1);
  });

  it('aggregates a numeric asset property — numbers, numeric strings and { value } objects', () => {
    expect(value({ kind: 'property', path: 'capacity', fn: 'sum' }, 'site')?.value).toBe(150);
    expect(
      value({ kind: 'property', path: 'power', fn: 'avg', type: 'turbine' }, 'site')?.value
    ).toBe(6);
    expect(value({ kind: 'property', path: 'power', fn: 'max' }, 'farmA')?.value).toBe(7);
    // nothing to aggregate is "no value", not zero
    expect(value({ kind: 'property', path: 'power', fn: 'sum' }, 'farmB')?.value).toBeNull();
  });

  it('aggregates latest measurement values of the subtree’s devices', () => {
    expect(
      value({ kind: 'measurement', series: 'c8y_Temperature.T', fn: 'avg' }, 'site')?.value
    ).toBe(25);
    expect(
      value({ kind: 'measurement', series: 'c8y_Temperature.T', fn: 'min' }, 'farmA')?.value
    ).toBe(20);
    expect(
      value({ kind: 'measurement', series: 'c8y_Temperature.T', fn: 'sum' }, 't3')?.value
    ).toBeNull();
  });

  it('colours the dot by the worst shown severity only', () => {
    const counts = { critical: 0, major: 0, minor: 3, warning: 1 };

    expect(dotSeverity(counts, ['critical', 'major', 'minor', 'warning'])).toBe('minor');
    expect(dotSeverity(counts, ['critical', 'major'])).toBeNull();
  });

  it('reads numbers along a path and refuses everything else', () => {
    expect(readNumber({ a: { b: 3 } }, 'a.b')).toBe(3);
    expect(readNumber({ a: ' 4.5 ' }, 'a')).toBe(4.5);
    expect(readNumber({ a: 'x' }, 'a')).toBeNull();
    expect(readNumber({ a: true }, 'a')).toBeNull();
    expect(readNumber({}, 'a.b')).toBeNull();
  });

  describe('the stored contract', () => {
    it('defaults to what a branch showed before: count, availability, alarms; count as badge', () => {
      const config = defaultRollups();

      expect(config.default.fields.map(rollupFieldId)).toEqual([
        'count:units',
        'availability:available',
        'availability:unavailable',
        'alarms:critical,major,minor,warning',
      ]);
      expect(config.default.badge).toBe('count:units');
      expect(normalizeRollups(undefined)).toEqual(config);
    });

    it('keeps valid fields, drops malformed and duplicate ones, and an unknown badge', () => {
      const config = normalizeRollups({
        version: 1,
        dotSeverities: ['major', 'critical', 'bogus'],
        default: { fields: [], badge: null },
        types: {
          farm: {
            fields: [
              {
                label: 'Capacity',
                metric: { kind: 'property', path: 'capacity', fn: 'sum' },
                unit: 'MW',
              },
              { label: 'dup', metric: { kind: 'property', path: 'capacity', fn: 'sum' } },
              { label: 'bad fn', metric: { kind: 'property', path: 'capacity', fn: 'median' } },
              { label: 'bad series', metric: { kind: 'measurement', series: 'nodot', fn: 'avg' } },
              { label: '', metric: { kind: 'alarms', severities: [] } },
            ],
            badge: 'nope',
          },
        },
      });

      expect(config.dotSeverities).toEqual(['critical', 'major']);
      expect(config.types['farm'].fields).toEqual([
        {
          label: 'Capacity',
          metric: { kind: 'property', path: 'capacity', fn: 'sum' },
          unit: 'MW',
        },
      ]);
      expect(config.types['farm'].badge).toBeNull();
      expect(rollupsForType(config, 'farm')).toBe(config.types['farm']);
      expect(rollupsForType(config, 'site')).toBe(config.default);
    });

    it('asks for latest values only while a measurement rollup is configured', () => {
      const config = defaultRollups();

      expect(needsLatestValues(config)).toBeFalse();
      config.types['farm'] = {
        fields: [{ label: '', metric: { kind: 'measurement', series: 'c8y_Power.P', fn: 'sum' } }],
        badge: null,
      };
      expect(needsLatestValues(config)).toBeTrue();
    });
  });
});
