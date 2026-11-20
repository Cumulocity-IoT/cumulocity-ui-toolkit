import type { AlarmCounts, AssetHierarchy, AssetNode } from '../asset-store/asset-store.model';
import { deviceTypes, measurementSeries, propertyOptions } from './settings-catalog';

const NO_ALARMS: AlarmCounts = { critical: 0, major: 0, minor: 0, warning: 0 };

function node(id: string, type: string, extra: Partial<AssetNode> = {}): AssetNode {
  return {
    id,
    name: id,
    type,
    parentId: null,
    childIds: [],
    depth: 0,
    alarms: NO_ALARMS,
    availability: 'unknown',
    isDevice: false,
    devices: [],
    properties: {},
    ...extra,
  };
}

function hierarchy(nodes: AssetNode[]): AssetHierarchy {
  return {
    byId: new Map(nodes.map((n) => [n.id, n])),
    rootIds: [],
    rollup: new Map(),
    asOf: '',
    mode: 'full',
    pendingChildren: new Set(),
  };
}

describe('the settings catalog', () => {
  const fleet = hierarchy([
    node('f1', 'farm', {
      properties: {
        area: 'West',
        capacity: 120,
        rated: { value: 6, unit: 'MW' },
        c8y_Hardware: { model: 'X', serialNumber: 'S1' },
        lastUpdated: '2026',
        c8y_LatestMeasurements: { c8y_Power: { P: { value: 3 } } },
      },
      devices: [
        {
          id: 'd',
          name: 'd',
          type: 'ctrl',
          availability: 'unknown',
          alarms: NO_ALARMS,
          latest: { 'c8y_Temp.T': 1 },
        },
      ],
    }),
    node('f2', 'farm', { properties: { area: 'East', capacity: '80' } }),
    node('t1', 'turbine', { properties: { power: 5 } }),
  ]);

  it('lists the leaf paths of a type with the values seen, numeric when every value parses', () => {
    expect(propertyOptions(fleet, 'farm')).toEqual([
      { path: 'area', numeric: false, values: ['East', 'West'] },
      { path: 'c8y_Hardware.model', numeric: false, values: ['X'] },
      { path: 'c8y_Hardware.serialNumber', numeric: false, values: ['S1'] },
      { path: 'capacity', numeric: true, values: ['120', '80'] },
      { path: 'rated', numeric: true, values: ['6'] },
    ]);
    expect(propertyOptions(fleet, null).map((option) => option.path)).toContain('power');
  });

  it('collects measurement series from assets and devices, and device types', () => {
    expect(measurementSeries(fleet)).toEqual(['c8y_Power.P', 'c8y_Temp.T']);
    expect(deviceTypes(fleet)).toEqual(['ctrl']);
  });
});
