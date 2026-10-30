import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AssetDefinitionService } from '../../services/asset-store/asset-definition.service';
import { buildHierarchy, type RawManagedObject } from '../../services/asset-store/asset-rollup';
import type { AssetHierarchy } from '../../services/asset-store/asset-store.model';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import {
  DEFAULT_SETTINGS,
  type NavigatorSettings,
} from '../../services/settings/navigator-settings.model';
import { NavigatorSettingsService } from '../../services/settings/navigator-settings.service';
import {
  defaultRollups,
  type RollupConfig,
  type RollupField,
  type RollupMetric,
} from '../../services/settings/rollup.model';
import { applyTreeFilter } from '../../services/settings/tree-filter.model';
import { AssetTreeService } from './asset-tree.service';
import { RollupService, formatRollup } from './rollup.service';

const asOf = '2026-10-30T00:00:00Z';

function asset(
  id: string,
  type: string,
  children: string[],
  extra: Record<string, unknown> = {}
): RawManagedObject {
  return {
    id,
    name: id,
    type,
    c8y_IsAsset: {},
    childAssets: { references: children.map((child) => ({ managedObject: { id: child } })) },
    ...extra,
  };
}

function device(id: string, extra: Record<string, unknown> = {}): RawManagedObject {
  return { id, name: id, type: 'controller', c8y_IsDevice: {}, ...extra };
}

const temperature = (value: number) => ({
  c8y_LatestMeasurements: { c8y_Temperature: { T: { value, unit: '°C' } } },
});

/**
 * site
 * ├─ farmA (capacity 100)
 * │  ├─ t1 (power 5, 1 major alarm) ── d1 unavailable, 2 minor, T=20
 * │  └─ t2 (power 7)                ── d2 available, T=30
 * └─ farmB (capacity "50")
 *    └─ t3
 */
function fleet(): AssetHierarchy {
  return buildHierarchy(
    [
      asset('site', 'site', ['farmA', 'farmB']),
      asset('farmA', 'farm', ['t1', 't2'], { capacity: 100 }),
      asset('farmB', 'farm', ['t3'], { capacity: '50' }),
      asset('t1', 'turbine', ['d1'], {
        power: { value: 5, unit: 'MW' },
        c8y_ActiveAlarmsStatus: { major: 1 },
      }),
      asset('t2', 'turbine', ['d2'], { power: 7 }),
      asset('t3', 'turbine', []),
      device('d1', {
        c8y_Availability: { status: 'UNAVAILABLE' },
        c8y_ActiveAlarmsStatus: { minor: 2 },
        ...temperature(20),
      }),
      device('d2', { c8y_Availability: { status: 'AVAILABLE' }, ...temperature(30) }),
    ],
    asOf
  );
}

const ALL = ['critical', 'major', 'minor', 'warning'] as const;

describe('RollupService', () => {
  let settings: ReturnType<typeof signal<NavigatorSettings>>;
  let treeHierarchy: ReturnType<typeof signal<AssetHierarchy | null>>;
  let storeHierarchy: ReturnType<typeof signal<AssetHierarchy | null>>;
  let dtm: ReturnType<typeof signal<boolean | null>>;
  let service: RollupService;
  let hierarchy: AssetHierarchy;

  const withRollups = (change: (config: RollupConfig) => void) => {
    const rollups = defaultRollups();

    change(rollups);
    settings.set({ ...DEFAULT_SETTINGS, rollups });
  };
  const node = (id: string) => hierarchy.byId.get(id)!;
  const value = (id: string, metric: RollupMetric) => service.valueFor(id, metric)?.value;

  beforeEach(() => {
    hierarchy = fleet();
    settings = signal<NavigatorSettings>(DEFAULT_SETTINGS);
    treeHierarchy = signal<AssetHierarchy | null>(hierarchy);
    storeHierarchy = signal<AssetHierarchy | null>(hierarchy);
    dtm = signal<boolean | null>(false);
    TestBed.configureTestingModule({
      providers: [
        { provide: AssetTreeService, useValue: { hierarchy: treeHierarchy } },
        { provide: AssetStoreService, useValue: { hierarchy: storeHierarchy } },
        { provide: NavigatorSettingsService, useValue: { settings } },
        { provide: AssetDefinitionService, useValue: { available: dtm } },
      ],
    });
    service = TestBed.inject(RollupService);
  });

  describe('values', () => {
    it('counts assets below a branch, optionally of one type, and the devices in it', () => {
      expect(value('site', { kind: 'count', of: 'assets' })).toBe(5);
      expect(value('site', { kind: 'count', of: 'assets', type: 'turbine' })).toBe(3);
      expect(value('farmA', { kind: 'count', of: 'devices' })).toBe(2);
      expect(value('site', { kind: 'count', of: 'devices', type: 'other' })).toBe(0);
    });

    it('counts units as the tree does: devices without the Digital Twin Manager, assets with it', () => {
      expect(value('site', { kind: 'count', of: 'units' })).toBe(2);
      dtm.set(true);
      expect(value('site', { kind: 'count', of: 'units' })).toBe(5);
    });

    it('counts devices by availability, out of all devices', () => {
      expect(service.valueFor('site', { kind: 'availability', state: 'available' })).toEqual({
        value: 1,
        of: 2,
      });
      expect(value('farmA', { kind: 'availability', state: 'unavailable' })).toBe(1);
      expect(value('farmB', { kind: 'availability', state: 'unavailable' })).toBe(0);
    });

    it('sums active alarms of the chosen severities and counts alarmed assets and devices', () => {
      expect(service.valueFor('site', { kind: 'alarms', severities: [...ALL] })).toEqual({
        value: 3,
        alarms: { critical: 0, major: 1, minor: 2, warning: 0 },
      });
      expect(value('site', { kind: 'alarms', severities: ['critical', 'major'] })).toBe(1);
      expect(value('site', { kind: 'alarmed', of: 'assets', severities: ['major'] })).toBe(1);
      expect(value('site', { kind: 'alarmed', of: 'devices', severities: ['minor'] })).toBe(1);
      expect(value('farmB', { kind: 'alarmed', of: 'devices', severities: [...ALL] })).toBe(0);
    });

    it('aggregates a numeric property with sum, avg, min and max', () => {
      expect(value('site', { kind: 'property', path: 'capacity', fn: 'sum' })).toBe(150);
      expect(value('site', { kind: 'property', path: 'capacity', fn: 'avg' })).toBe(75);
      expect(value('site', { kind: 'property', path: 'capacity', fn: 'min' })).toBe(50);
      expect(value('site', { kind: 'property', path: 'power', fn: 'max', type: 'turbine' })).toBe(
        7
      );
      expect(value('farmB', { kind: 'property', path: 'power', fn: 'sum' })).toBeNull();
    });

    it('aggregates the latest measurement values of the devices in the subtree', () => {
      const series = 'c8y_Temperature.T';

      expect(value('site', { kind: 'measurement', series, fn: 'avg' })).toBe(25);
      expect(value('site', { kind: 'measurement', series, fn: 'sum' })).toBe(50);
      expect(value('site', { kind: 'measurement', series, fn: 'min' })).toBe(20);
      expect(value('site', { kind: 'measurement', series, fn: 'max' })).toBe(30);
      expect(value('farmB', { kind: 'measurement', series, fn: 'avg' })).toBeNull();
    });

    it("reads the tree's filtered hierarchy, and the store's for an asset the filter hides", () => {
      const filtered = applyTreeFilter(hierarchy, {
        version: 1,
        enabled: true,
        conditions: [{ type: 'farm', test: { kind: 'unavailable' } }],
        hideEmpty: true,
      })!.hierarchy;

      treeHierarchy.set(filtered);
      // farmB is gone: the site counts farmA's subtree only
      expect(value('site', { kind: 'count', of: 'assets' })).toBe(3);
      expect(value('site', { kind: 'property', path: 'capacity', fn: 'sum' })).toBe(100);
      // the settings preview of a hidden asset still has its values
      expect(value('farmB', { kind: 'property', path: 'capacity', fn: 'sum' })).toBe(50);
    });

    it('has no value before the first sweep', () => {
      treeHierarchy.set(null);
      storeHierarchy.set(null);
      expect(service.valueFor('site', { kind: 'count', of: 'assets' })).toBeUndefined();
    });
  });

  describe('memoization', () => {
    it('returns the same values for the same hierarchy and metric', () => {
      const metric: RollupMetric = { kind: 'alarms', severities: [...ALL] };

      expect(service.valueFor('site', metric)).toBe(service.valueFor('site', metric));
      // keyed by the metric's identity, not the object
      expect(service.valueFor('site', { kind: 'alarms', severities: [...ALL] })).toBe(
        service.valueFor('site', metric)
      );
    });

    it('recomputes for a new hierarchy and when the count unit changes', () => {
      const metric: RollupMetric = { kind: 'count', of: 'units' };
      const before = service.valueFor('site', metric);
      const next = fleet();

      treeHierarchy.set(next);
      expect(service.valueFor('site', metric)).not.toBe(before);
      expect(service.valueFor('site', metric)).toEqual(before);

      dtm.set(true);
      expect(service.valueFor('site', metric)?.value).toBe(5);
    });
  });

  describe('badge, rows and the dot', () => {
    it('shows the count of units as the badge by default, and no badge for an empty count', () => {
      expect(service.badge(node('site'))).toEqual(
        jasmine.objectContaining({ key: 'count:units', label: 'Devices', value: '2' })
      );
      expect(service.badge(node('farmB'))).toBeNull();
    });

    it("picks the type's configured badge and falls back to the default set for other types", () => {
      withRollups((config) => {
        config.types['farm'] = {
          fields: [
            {
              label: 'Capacity',
              metric: { kind: 'property', path: 'capacity', fn: 'sum' },
              unit: 'MW',
            },
          ],
          badge: 'property:sum:capacity',
        };
      });

      expect(service.badge(node('farmA'))).toEqual({
        key: 'property:sum:capacity',
        label: 'Capacity',
        render: 'text',
        value: '100 MW',
      });
      expect(service.badge(node('site'))?.key).toBe('count:units');
    });

    it('shows no badge when none is configured or the value is missing; a measured 0 is a value', () => {
      withRollups((config) => {
        config.types['farm'] = {
          fields: [{ label: '', metric: { kind: 'property', path: 'capacity', fn: 'sum' } }],
          badge: null,
        };
        config.types['turbine'] = {
          fields: [{ label: '', metric: { kind: 'property', path: 'power', fn: 'min' } }],
          badge: 'property:min:power',
        };
      });

      expect(service.badge(node('farmA'))).toBeNull();
      // t3 has no power: nothing to show
      expect(service.badge(node('t3'))).toBeNull();

      hierarchy = buildHierarchy([asset('t9', 'turbine', [], { power: 0 })], asOf);
      treeHierarchy.set(hierarchy);
      expect(service.badge(node('t9'))?.value).toBe('0');
    });

    it('lists the rows in the configured order, with their labels and values', () => {
      expect(service.rows(node('site'))).toEqual([
        { key: 'count:units', label: 'Devices', render: 'text', value: '2' },
        { key: 'availability:available', label: 'Available', render: 'text', value: '1 of 2' },
        { key: 'availability:unavailable', label: 'Unavailable', render: 'text', value: '1' },
        {
          key: 'alarms:critical,major,minor,warning',
          label: 'Alarms',
          render: 'alarms',
          value: '1 major, 2 minor',
        },
      ]);

      withRollups((config) => {
        config.default = {
          fields: [
            {
              label: 'Hot',
              metric: { kind: 'measurement', series: 'c8y_Temperature.T', fn: 'max' },
            },
            { label: '', metric: { kind: 'count', of: 'assets', type: 'turbine' } },
          ],
          badge: null,
        };
      });
      expect(service.rows(node('site')).map((row) => [row.label, row.value])).toEqual([
        ['Hot', '30'],
        ['Assets · turbine', '3'],
      ]);
    });

    it('labels a field without a label of its own by its metric', () => {
      const label = (metric: RollupMetric) => service.labelOf({ label: '', metric });

      expect(service.labelOf({ label: 'Mine', metric: { kind: 'count', of: 'units' } })).toBe(
        'Mine'
      );
      expect(label({ kind: 'count', of: 'units' })).toBe('Devices');
      expect(label({ kind: 'alarms', severities: ['critical', 'major'] })).toBe(
        'Alarms · critical, major'
      );
      expect(label({ kind: 'alarmed', of: 'devices', severities: ['major'] })).toBe(
        'Devices with alarms'
      );
      expect(label({ kind: 'property', path: 'capacity', fn: 'avg' })).toBe('Average · capacity');
      expect(label({ kind: 'measurement', series: 'CPU.Usage', fn: 'max' })).toBe(
        'Maximum · CPU.Usage'
      );
      dtm.set(true);
      expect(label({ kind: 'count', of: 'units' })).toBe('Assets');
    });

    it('colours the dot by the configured severities only, and keeps a partial subtree as is', () => {
      const rollup = {
        ...hierarchy.rollup.get('site')!,
        alarms: { critical: 0, major: 0, minor: 2, warning: 1 },
      };

      expect(service.dotSeverity(rollup)).toBe('minor');
      withRollups((config) => (config.dotSeverities = ['critical', 'major', 'warning']));
      expect(service.dotSeverity(rollup)).toBe('warning');
      withRollups((config) => (config.dotSeverities = ['critical', 'major']));
      expect(service.dotSeverity(rollup)).toBeNull();
      // a partly loaded subtree keeps the node's own severity
      expect(service.dotSeverity({ ...rollup, partial: true, worst: 'minor' })).toBe('minor');
    });
  });
});

describe('formatRollup', () => {
  const field = (metric: RollupMetric, extra: Partial<RollupField> = {}): RollupField => ({
    label: '',
    metric,
    ...extra,
  });
  const sum: RollupMetric = { kind: 'property', path: 'power', fn: 'sum' };
  const local = (n: number, digits: number) =>
    n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });

  it('shows a dash for a missing value', () => {
    expect(formatRollup(field(sum), undefined)).toBe('—');
    expect(formatRollup(field(sum), { value: null })).toBe('—');
  });

  it('shows "x of y" for a ratio and the per-severity breakdown for alarms', () => {
    const available = field({ kind: 'availability', state: 'available' }, { display: 'ratio' });
    const alarms = field({ kind: 'alarms', severities: [...ALL] }, { display: 'breakdown' });

    expect(formatRollup(available, { value: 15, of: 19 })).toBe('15 of 19');
    // a ratio without its total falls back to the plain count
    expect(formatRollup(available, { value: 15 })).toBe('15');
    expect(
      formatRollup(alarms, { value: 3, alarms: { critical: 1, major: 0, minor: 2, warning: 0 } })
    ).toBe('1 critical, 2 minor');
    expect(
      formatRollup(alarms, { value: 0, alarms: { critical: 0, major: 0, minor: 0, warning: 0 } })
    ).toBe('None');
  });

  it('rounds numbers to the precision (1 by default), localized, with the unit', () => {
    expect(formatRollup(field(sum), { value: 56400.04 })).toBe(local(56400.04, 1));
    expect(formatRollup(field(sum, { precision: 2, unit: 'kW' }), { value: 1.23456 })).toBe(
      `${local(1.23456, 2)} kW`
    );
    expect(formatRollup(field(sum, { precision: 0 }), { value: 22.8 })).toBe('23');
  });

  it('shows counts as plain integers, with the unit', () => {
    expect(formatRollup(field({ kind: 'count', of: 'assets' }), { value: 12000 })).toBe('12000');
    expect(
      formatRollup(field({ kind: 'count', of: 'devices' }, { unit: 'pcs' }), { value: 3 })
    ).toBe('3 pcs');
  });
});
