import { detailFieldId } from '../../services/settings/detail-panel.model';
import { EMPTY_ROLLUP, type AssetRollup } from '../../services/asset-store/asset-store.model';
import {
  DETAIL_FIELD_CATALOGUE,
  branchFieldCatalogue,
  propertyField,
  readPath,
  seriesFor,
} from './asset-detail-fields';
import { branchRows, formatValue } from './asset-detail-panel.component';

describe('the detail field vocabulary', () => {
  it('declares every built-in field once', () => {
    const ids = DETAIL_FIELD_CATALOGUE.map(detailFieldId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('offers a branch neither availability nor alarms — its subtree rows already say both', () => {
    const kinds = branchFieldCatalogue().map((field) => field.source.kind);

    expect(kinds).not.toContain('availability');
    expect(kinds).not.toContain('alarms');
    expect(kinds).toContain('property');
  });

  it('labels a picked inventory path after its last segment', () => {
    expect(propertyField('c8y_Hardware.serialNumber')).toEqual({
      label: 'Serial Number',
      source: { kind: 'property', path: 'c8y_Hardware.serialNumber' },
    });
  });

  it('collects the measurement series a field list needs, and nothing else', () => {
    expect(
      seriesFor([
        { label: 'T', source: { kind: 'measurement', series: 'c8y_Temperature.T', fn: 'latest' } },
        { label: 'Model', source: { kind: 'property', path: 'c8y_Hardware.model' } },
        { label: 'Alarms', source: { kind: 'alarms' } },
      ])
    ).toEqual(['c8y_Temperature.T']);
    expect(seriesFor(DETAIL_FIELD_CATALOGUE)).toEqual([]);
  });

  it('reads dot paths, and nothing through a scalar', () => {
    const mo = { c8y_Hardware: { model: 'X1' }, flat: 3 };

    expect(readPath(mo, 'c8y_Hardware.model')).toBe('X1');
    expect(readPath(mo, 'flat.deeper')).toBeUndefined();
    expect(readPath(mo, 'missing.model')).toBeUndefined();
  });
});

describe('branchRows', () => {
  const rollup: AssetRollup = {
    ...EMPTY_ROLLUP,
    alarms: { critical: 1, major: 0, minor: 2, warning: 0 },
    assetCount: 5,
    deviceCount: 3,
    availableCount: 2,
    unavailableCount: 1,
  };

  it('counts devices without the DTM', () => {
    expect(branchRows(rollup, 'devices').map((row) => [row.label, row.value])).toEqual([
      ['Devices', '3'],
      ['Available', '2 of 3'],
      ['Unavailable', '1'],
      ['Alarms', '1 critical, 2 minor'],
    ]);
  });

  it('counts assets with the DTM; availability stays about devices', () => {
    const rows = branchRows(rollup, 'assets');

    expect(rows[0]).toEqual(jasmine.objectContaining({ label: 'Assets', value: '5' }));
    expect(rows[1].value).toBe('2 of 3');
  });

  it('says "None" for a clean subtree', () => {
    expect(branchRows(EMPTY_ROLLUP, 'devices')[3].value).toBe('None');
  });
});

describe('formatValue', () => {
  it('keeps text as stored, a number included, unless a precision asks for rounding', () => {
    expect(formatValue('X1', {})).toBe('X1');
    expect(formatValue(2019, {})).toBe('2019');
    expect(formatValue(2.345, { precision: 1, unit: 'kW' })).toBe('2.3 kW');
  });

  it('formats numbers, percentages and dates', () => {
    expect(formatValue('4.56', { format: 'number', precision: 0 })).toBe('5');
    expect(formatValue(97.04, { format: 'percent' })).toBe('97.0 %');
    expect(formatValue('2026-01-02T03:04:05Z', { format: 'date' })).toBe(
      new Date('2026-01-02T03:04:05Z').toLocaleString()
    );
    expect(formatValue('not a date', { format: 'date' })).toBe('—');
  });

  it('dashes missing and structured values', () => {
    expect(formatValue(undefined, {})).toBe('—');
    expect(formatValue('', {})).toBe('—');
    expect(formatValue({ a: 1 }, {})).toBe('—');
  });
});
