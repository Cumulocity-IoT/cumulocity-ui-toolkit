import { gettext } from '@c8y/ngx-components/gettext';

/**
 * The detail panel's **data contract**: which fields the hover detail panel shows, per asset or
 * device type. Plain, versioned JSON — stored inside the navigator settings
 * (`NavigatorSettings.detailPanel`) and described by the JSON Schema next to this file
 * (`detail-panel.schema.json`). Keep the two in step; the unit tests check they agree.
 *
 * Resolution, for the asset the panel shows:
 * - `types[asset.type]` when present (an empty list is a valid "show no fields"),
 * - otherwise `default` for a leaf asset, and **nothing** for a branch — a branch always shows
 *   its subtree counts (devices/assets, availability, alarms) and configured fields are
 *   additions to those.
 */
export interface DetailPanelConfig {
  /** Contract version. Anything else is ignored and the defaults apply. */
  version: 1;
  /** Field lists by managed-object `type`. */
  types: Record<string, DetailField[]>;
  /** The fields of every leaf type without an entry in {@link types}. */
  default: DetailField[];
}

/** One row of the panel. */
export interface DetailField {
  /** Row label, shown as is (and translated when the plugin knows the string). */
  label: string;
  /** Where the value comes from. */
  source: DetailFieldSource;
  /** Appended to the value, e.g. `kW`. For measurements the reading's own unit is the fallback. */
  unit?: string;
  /** How the value is rendered. Default `text`. */
  format?: DetailFieldFormat;
  /** Decimals for `number` and `percent`. Default 1. */
  precision?: number;
}

export type DetailFieldSource =
  /** A dot path into the managed object, e.g. `c8y_Hardware.model`. No request. */
  | { kind: 'property'; path: string }
  /**
   * A measurement series `<fragment>.<series>` (e.g. `c8y_Temperature.T`). `latest` is the only
   * function: it reads `c8y_LatestMeasurements` with one request per asset.
   */
  | { kind: 'measurement'; series: string; fn: MeasurementFn }
  /** Active alarms of the asset and everything below it, by severity. No request. */
  | { kind: 'alarms' }
  /** `c8y_Availability` in words (the asset's own, or its devices'). No request. */
  | { kind: 'availability' }
  /** The managed object's `lastUpdated`. No request. */
  | { kind: 'lastUpdated' }
  /** The managed object's `type`. No request. */
  | { kind: 'type' };

export const DETAIL_PANEL_VERSION = 1;
export const DETAIL_SOURCE_KINDS = [
  'property',
  'measurement',
  'alarms',
  'availability',
  'lastUpdated',
  'type',
] as const;
export const MEASUREMENT_FNS = ['latest'] as const;
export const DETAIL_FIELD_FORMATS = ['text', 'number', 'percent', 'date'] as const;
export type MeasurementFn = (typeof MEASUREMENT_FNS)[number];
export type DetailFieldFormat = (typeof DETAIL_FIELD_FORMATS)[number];

/** Limits the normalizer (and the schema) enforce. */
export const DETAIL_PANEL_LIMITS = {
  maxFields: 50,
  maxLabel: 100,
  maxUnit: 20,
  maxPrecision: 6,
} as const;

/** `fragment.sub.leaf` — no empty segments, no whitespace. */
export const PROPERTY_PATH_PATTERN = /^[^.\s]+(\.[^.\s]+)*$/;
/** `fragment.series` — exactly what `c8y_LatestMeasurements` is keyed by. */
export const MEASUREMENT_SERIES_PATTERN = /^[^.\s]+\.[^.\s]+$/;

/** The out-of-the-box fields: platform-standard fragments only, so they fill on any tenant. */
export const DEFAULT_DETAIL_FIELDS: readonly DetailField[] = Object.freeze([
  { label: gettext('Status'), source: { kind: 'availability' } },
  { label: gettext('Alarms'), source: { kind: 'alarms' } },
  { label: gettext('Type'), source: { kind: 'type' } },
  { label: gettext('Last updated'), source: { kind: 'lastUpdated' }, format: 'date' },
  { label: gettext('Model'), source: { kind: 'property', path: 'c8y_Hardware.model' } },
  { label: gettext('Serial'), source: { kind: 'property', path: 'c8y_Hardware.serialNumber' } },
  { label: gettext('Firmware'), source: { kind: 'property', path: 'c8y_Firmware.version' } },
] satisfies DetailField[]);

export function defaultDetailPanel(): DetailPanelConfig {
  return {
    version: DETAIL_PANEL_VERSION,
    types: {},
    default: DEFAULT_DETAIL_FIELDS.map(cloneField),
  };
}

/**
 * Stable identity of a field's **source** (`property:c8y_Hardware.model`, `alarms`, …): what the
 * editor dedupes and toggles by. Two fields reading the same source are the same field.
 */
export function detailFieldId(field: Pick<DetailField, 'source'>): string {
  const { source } = field;

  switch (source.kind) {
    case 'property':
      return `property:${source.path}`;
    case 'measurement':
      return `measurement:${source.series}:${source.fn}`;
    default:
      return source.kind;
  }
}

/** The fields to render for an asset of `type` (see {@link DetailPanelConfig}). */
export function fieldsForType(
  config: DetailPanelConfig,
  type: string | null | undefined,
  isBranch: boolean
): readonly DetailField[] {
  const configured = type ? config.types[type] : undefined;

  if (configured) return configured;

  return isBranch ? [] : config.default;
}

/**
 * Stored data is never trusted: malformed fields are dropped one by one, valid ones kept. A
 * missing or unreadable document — or another `version` — gives the defaults.
 */
export function normalizeDetailPanel(raw: unknown): DetailPanelConfig {
  if (!isRecord(raw) || raw['version'] !== DETAIL_PANEL_VERSION) return defaultDetailPanel();
  const types: Record<string, DetailField[]> = {};

  if (isRecord(raw['types'])) {
    for (const [type, fields] of Object.entries(raw['types'])) {
      if (type.trim() && Array.isArray(fields)) types[type] = normalizeFieldList(fields);
    }
  }

  return {
    version: DETAIL_PANEL_VERSION,
    types,
    default: Array.isArray(raw['default'])
      ? normalizeFieldList(raw['default'])
      : DEFAULT_DETAIL_FIELDS.map(cloneField),
  };
}

/** Valid fields only, first of each source wins, capped at {@link DETAIL_PANEL_LIMITS}. */
export function normalizeFieldList(raw: readonly unknown[]): DetailField[] {
  const seen = new Set<string>();
  const fields: DetailField[] = [];

  for (const entry of raw) {
    const field = normalizeDetailField(entry);

    if (!field) continue;
    const id = detailFieldId(field);

    if (seen.has(id)) continue;
    seen.add(id);
    fields.push(field);
    if (fields.length >= DETAIL_PANEL_LIMITS.maxFields) break;
  }

  return fields;
}

/** One field, or `null` when it cannot be rendered. Unknown extra keys are dropped. */
export function normalizeDetailField(raw: unknown): DetailField | null {
  if (!isRecord(raw)) return null;
  const label = typeof raw['label'] === 'string' ? raw['label'].trim() : '';

  if (!label || label.length > DETAIL_PANEL_LIMITS.maxLabel) return null;
  const source = normalizeSource(raw['source']);

  if (!source) return null;
  const field: DetailField = { label, source };
  const { unit, format, precision } = raw;

  if (typeof unit === 'string' && unit.trim() && unit.length <= DETAIL_PANEL_LIMITS.maxUnit) {
    field.unit = unit.trim();
  }

  if (typeof format === 'string' && (DETAIL_FIELD_FORMATS as readonly string[]).includes(format)) {
    field.format = format as DetailFieldFormat;
  }

  if (
    typeof precision === 'number' &&
    Number.isInteger(precision) &&
    precision >= 0 &&
    precision <= DETAIL_PANEL_LIMITS.maxPrecision
  ) {
    field.precision = precision;
  }

  return field;
}

function normalizeSource(raw: unknown): DetailFieldSource | null {
  if (!isRecord(raw)) return null;

  switch (raw['kind']) {
    case 'property': {
      const path = raw['path'];

      return typeof path === 'string' && PROPERTY_PATH_PATTERN.test(path)
        ? { kind: 'property', path }
        : null;
    }

    case 'measurement': {
      const series = raw['series'];
      const fn = raw['fn'] ?? 'latest';

      return typeof series === 'string' &&
        MEASUREMENT_SERIES_PATTERN.test(series) &&
        (MEASUREMENT_FNS as readonly unknown[]).includes(fn)
        ? { kind: 'measurement', series, fn: fn as MeasurementFn }
        : null;
    }
    case 'alarms':
    case 'availability':
    case 'lastUpdated':
    case 'type':
      return { kind: raw['kind'] };
    default:
      return null;
  }
}

function cloneField(field: DetailField): DetailField {
  return { ...field, source: { ...field.source } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
