import schema from './detail-panel.schema.json';
import {
  DEFAULT_DETAIL_FIELDS,
  DETAIL_FIELD_FORMATS,
  DETAIL_PANEL_LIMITS,
  DETAIL_SOURCE_KINDS,
  MEASUREMENT_FNS,
  MEASUREMENT_SERIES_PATTERN,
  PROPERTY_PATH_PATTERN,
  defaultDetailPanel,
  detailFieldId,
  fieldsForType,
  normalizeDetailPanel,
  type DetailPanelConfig,
} from './detail-panel.model';

describe('detail panel contract', () => {
  describe('defaults', () => {
    it('ship generic, platform-standard fields only', () => {
      expect(DEFAULT_DETAIL_FIELDS.map(detailFieldId)).toEqual([
        'availability',
        'alarms',
        'type',
        'lastUpdated',
        'property:c8y_Hardware.model',
        'property:c8y_Hardware.serialNumber',
        'property:c8y_Firmware.version',
      ]);
    });

    it('are a valid document and normalize to themselves', () => {
      const defaults = defaultDetailPanel();

      expect(defaults).toEqual({ version: 1, types: {}, default: [...DEFAULT_DETAIL_FIELDS] });
      expect(normalizeDetailPanel(JSON.parse(JSON.stringify(defaults)))).toEqual(defaults);
    });

    it('apply when nothing usable is stored — no migration from older preferences', () => {
      expect(normalizeDetailPanel(undefined)).toEqual(defaultDetailPanel());
      expect(normalizeDetailPanel('x')).toEqual(defaultDetailPanel());
      expect(normalizeDetailPanel([])).toEqual(defaultDetailPanel());
      // The retired `ps.assetNav.detailFields` preference shape is not read.
      expect(normalizeDetailPanel({ version: 2, byType: { a: ['status'] } })).toEqual(
        defaultDetailPanel()
      );
    });
  });

  describe('normalizeDetailPanel', () => {
    it('keeps valid entries and drops malformed ones one by one', () => {
      const config = normalizeDetailPanel({
        version: 1,
        default: [
          {
            label: 'Temp',
            source: { kind: 'measurement', series: 'c8y_Temperature.T', fn: 'latest' },
            unit: '°C',
            precision: 1,
          },
          { label: '', source: { kind: 'type' } },
          { label: 'Bad path', source: { kind: 'property', path: 'a..b' } },
          { label: 'Bad series', source: { kind: 'measurement', series: 'nodot', fn: 'latest' } },
          { label: 'Bad fn', source: { kind: 'measurement', series: 'a.b', fn: 'avg' } },
          { label: 'Unknown kind', source: { kind: 'sql' } },
          { label: 'Type', source: { kind: 'type' }, format: 'fancy', precision: 9, extra: true },
          { label: 'Duplicate', source: { kind: 'type' } },
        ],
        types: {
          c8y_Linux: [
            { label: 'Serial', source: { kind: 'property', path: 'c8y_Hardware.serialNumber' } },
          ],
          emptied: [],
          broken: 'nope',
          '': [],
        },
      });

      expect(config.default).toEqual([
        {
          label: 'Temp',
          source: { kind: 'measurement', series: 'c8y_Temperature.T', fn: 'latest' },
          unit: '°C',
          precision: 1,
        },
        { label: 'Type', source: { kind: 'type' } },
      ]);
      expect(config.types).toEqual({
        c8y_Linux: [
          { label: 'Serial', source: { kind: 'property', path: 'c8y_Hardware.serialNumber' } },
        ],
        emptied: [],
      });
    });

    it('defaults the measurement function to latest and keeps a missing default list built-in', () => {
      const config = normalizeDetailPanel({
        version: 1,
        types: { x: [{ label: 'T', source: { kind: 'measurement', series: 'a.b' } }] },
      });

      expect(config.types['x'][0].source).toEqual({
        kind: 'measurement',
        series: 'a.b',
        fn: 'latest',
      });
      expect(config.default).toEqual([...DEFAULT_DETAIL_FIELDS]);
    });

    it('caps a list at the field limit', () => {
      const many = Array.from({ length: 80 }, (_unused, index) => ({
        label: `F${index}`,
        source: { kind: 'property', path: `p${index}` },
      }));

      expect(normalizeDetailPanel({ version: 1, types: {}, default: many }).default.length).toBe(
        DETAIL_PANEL_LIMITS.maxFields
      );
    });
  });

  describe('fieldsForType', () => {
    const config: DetailPanelConfig = {
      version: 1,
      types: {
        building: [{ label: 'Floor', source: { kind: 'property', path: 'floor' } }],
        silent: [],
      },
      default: [{ label: 'Type', source: { kind: 'type' } }],
    };

    it("uses the type's own list, an empty one included", () => {
      expect(fieldsForType(config, 'building', true).map((field) => field.label)).toEqual([
        'Floor',
      ]);
      expect(fieldsForType(config, 'silent', false)).toEqual([]);
    });

    it('falls back to the default for a leaf and to nothing for a branch', () => {
      expect(fieldsForType(config, 'other', false)).toBe(config.default);
      expect(fieldsForType(config, 'other', true)).toEqual([]);
    });
  });

  describe('JSON schema', () => {
    const defs = (schema as any).$defs;

    it('is draft 2020-12 and requires what the interface requires', () => {
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(schema.required).toEqual(['version', 'types', 'default']);
      expect(schema.properties.version.const).toBe(1);
      expect(defs.field.required).toEqual(['label', 'source']);
    });

    it('lists exactly the source kinds, functions and formats the normalizer accepts', () => {
      const kinds = defs.source.oneOf.flatMap((variant: any) =>
        variant.properties.kind.const
          ? [variant.properties.kind.const]
          : variant.properties.kind.enum
      );

      expect([...kinds].sort()).toEqual([...DETAIL_SOURCE_KINDS].sort());
      expect(defs.source.oneOf[1].properties.fn.enum).toEqual([...MEASUREMENT_FNS]);
      expect(defs.field.properties.format.enum).toEqual([...DETAIL_FIELD_FORMATS]);
    });

    it('uses the same limits and patterns', () => {
      expect(defs.fieldList.maxItems).toBe(DETAIL_PANEL_LIMITS.maxFields);
      expect(defs.field.properties.label.maxLength).toBe(DETAIL_PANEL_LIMITS.maxLabel);
      expect(defs.field.properties.unit.maxLength).toBe(DETAIL_PANEL_LIMITS.maxUnit);
      expect(defs.field.properties.precision.maximum).toBe(DETAIL_PANEL_LIMITS.maxPrecision);
      expect(defs.source.oneOf[0].properties.path.pattern).toBe(PROPERTY_PATH_PATTERN.source);
      expect(defs.source.oneOf[1].properties.series.pattern).toBe(
        MEASUREMENT_SERIES_PATTERN.source
      );
    });
  });
});
