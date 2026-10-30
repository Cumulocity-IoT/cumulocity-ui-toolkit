import { detailFieldId } from '../../services/settings/detail-panel.model';
import type { AssetPropertyType } from '@c8y/ngx-components/asset-properties';
import {
  DETAIL_FIELD_CATALOGUE,
  assetPropertyField,
  branchFieldCatalogue,
  propertyField,
  readPath,
  seriesFor,
} from './asset-detail-fields';
import { formatValue } from './asset-detail-panel.component';

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

  describe('a property picked in the asset property selector', () => {
    const picked = (property: Partial<AssetPropertyType>) =>
      assetPropertyField({ name: '', label: '', type: 'string', ...property });

    it('reads its key path and keeps the label the selector showed', () => {
      expect(
        picked({
          name: 'serialNumber',
          label: 'Serial number',
          keyPath: ['c8y_Hardware', 'serialNumber'],
        })
      ).toEqual({
        label: 'Serial number',
        source: { kind: 'property', path: 'c8y_Hardware.serialNumber' },
      });
    });

    it('falls back to the name for a top-level property, and humanizes a bare key', () => {
      expect(picked({ name: 'ps_HubHeight' })).toEqual({
        label: 'Hub Height',
        source: { kind: 'property', path: 'ps_HubHeight' },
      });
      // undeclared fragments are labelled with their key
      expect(picked({ name: 'hub_height_m', label: 'hub_height_m' })?.label).toBe('Hub Height M');
    });

    it('drops what the panel cannot read: computed properties, whole objects, unusable paths', () => {
      expect(
        picked({ name: 'lastMeasurement', label: 'Last measurement', computed: true })
      ).toBeNull();
      expect(picked({ name: 'c8y_Hardware', label: 'Hardware', type: 'object' })).toBeNull();
      expect(picked({ name: 'a b', label: 'Spaced' })).toBeNull();
      expect(picked({ name: '' })).toBeNull();
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
