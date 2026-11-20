import { gettext } from '@c8y/ngx-components/gettext';
import {
  ALARM_SEVERITIES,
  type AlarmCounts,
  type AlarmSeverityKey,
  type AssetHierarchy,
  type AssetNode,
} from '../asset-store/asset-store.model';
import { postOrder, readLatestValues } from '../asset-store/asset-rollup';

/**
 * The **rollups** data contract: what a branch (an asset with assets below it) summarises about
 * its subtree — the rows its detail panel opens with, and the number on its tree row's badge —
 * per asset type, plus which alarm severities colour the status dot. Stored with the navigator
 * settings (`NavigatorSettings.rollups`) and edited in the settings drawer's "By level" tab.
 *
 * Every metric is computed from what the inventory sweep already holds, in one bottom-up pass
 * over the cached hierarchy: no request per asset or device. Latest measurement values come with
 * the sweep itself (`withLatestValues=true`), which the store asks for only while a
 * `measurement` rollup is configured (see {@link needsLatestValues}).
 */
export interface RollupConfig {
  /** Contract version. Anything else is ignored and the defaults apply. */
  version: 1;
  /** Rollups by managed-object `type` of the branch. */
  types: Record<string, RollupSet>;
  /** The rollups of every branch type without an entry in {@link types}. */
  default: RollupSet;
  /** Severities that colour the status dot; the others still count, they just do not show. */
  dotSeverities: AlarmSeverityKey[];
}

/** What one branch type shows. */
export interface RollupSet {
  /** Detail panel rows, in order. */
  fields: RollupField[];
  /** {@link rollupFieldId} of the field shown as the row badge; `null` for no badge. */
  badge: string | null;
}

export interface RollupField {
  /** Row label; empty = the metric's own label ({@link metricLabel}). */
  label: string;
  metric: RollupMetric;
  /**
   * `ratio` ("15 of 19") for `availability`, `breakdown` ("1 critical, 2 major") for `alarms`;
   * otherwise the plain value.
   */
  display?: RollupDisplay;
  /** Appended to the value, e.g. `kW`. */
  unit?: string;
  /** Decimals for `property` and `measurement` values. Default 1. */
  precision?: number;
}

export type RollupDisplay = 'value' | 'ratio' | 'breakdown';
export type RollupFn = 'sum' | 'avg' | 'min' | 'max';

/** "Units" are assets with the Digital Twin Manager and devices without — the tree's count. */
export type CountOf = 'units' | 'assets' | 'devices';

export type RollupMetric =
  /** Assets (below the branch) or devices (in the subtree), optionally of one `type`. */
  | { kind: 'count'; of: CountOf; type?: string }
  /** Devices reporting `c8y_Availability` in this state. */
  | { kind: 'availability'; state: 'available' | 'unavailable' }
  /** Active alarms of these severities on the subtree's assets and devices. */
  | { kind: 'alarms'; severities: AlarmSeverityKey[] }
  /** Assets or devices with at least one active alarm of these severities. */
  | { kind: 'alarmed'; of: 'assets' | 'devices'; severities: AlarmSeverityKey[] }
  /** A numeric asset property (a fragment path, e.g. a DTM attribute), optionally of one type. */
  | { kind: 'property'; path: string; fn: RollupFn; type?: string }
  /** The latest value of a measurement series on the subtree's assets and devices. */
  | { kind: 'measurement'; series: string; fn: RollupFn };

export type RollupMetricKind = RollupMetric['kind'];

export const ROLLUP_VERSION = 1;
export const ROLLUP_FNS = ['sum', 'avg', 'min', 'max'] as const;
export const ROLLUP_LIMITS = {
  maxFields: 20,
  maxLabel: 100,
  maxUnit: 20,
  maxPrecision: 6,
} as const;

/** `fragment.sub.leaf` — no empty segments, no whitespace. */
const PATH_PATTERN = /^[^.\s]+(\.[^.\s]+)*$/;
/** `fragment.series`. */
const SERIES_PATTERN = /^[^.\s]+\.[^.\s]+$/;

const ALL_SEVERITIES: AlarmSeverityKey[] = [...ALARM_SEVERITIES];

/** What a branch showed before rollups were configurable — still the default. */
export function defaultRollupSet(): RollupSet {
  return {
    fields: [
      { label: '', metric: { kind: 'count', of: 'units' } },
      { label: '', metric: { kind: 'availability', state: 'available' }, display: 'ratio' },
      { label: '', metric: { kind: 'availability', state: 'unavailable' } },
      {
        label: '',
        metric: { kind: 'alarms', severities: [...ALL_SEVERITIES] },
        display: 'breakdown',
      },
    ],
    badge: 'count:units',
  };
}

export function defaultRollups(): RollupConfig {
  return {
    version: ROLLUP_VERSION,
    types: {},
    default: defaultRollupSet(),
    dotSeverities: [...ALL_SEVERITIES],
  };
}

/** Stable identity of a field's metric — what the editor dedupes by and the badge refers to. */
export function rollupFieldId(field: Pick<RollupField, 'metric'>): string {
  const { metric } = field;

  switch (metric.kind) {
    case 'count':
      return ['count', metric.of, metric.type].filter(Boolean).join(':');
    case 'availability':
      return `availability:${metric.state}`;
    case 'alarms':
      return `alarms:${severityKey(metric.severities)}`;
    case 'alarmed':
      return `alarmed:${metric.of}:${severityKey(metric.severities)}`;
    case 'property':
      return ['property', metric.fn, metric.path, metric.type].filter(Boolean).join(':');
    case 'measurement':
      return `measurement:${metric.fn}:${metric.series}`;
  }
}

function severityKey(severities: readonly AlarmSeverityKey[]): string {
  return ALL_SEVERITIES.filter((severity) => severities.includes(severity)).join(',');
}

/** The rollups for a branch of `type`: its own set, else the default. */
export function rollupsForType(config: RollupConfig, type: string | null | undefined): RollupSet {
  return (type ? config.types[type] : undefined) ?? config.default;
}

/** Whether any configured rollup reads latest measurement values (the sweep then asks for them). */
export function needsLatestValues(config: RollupConfig): boolean {
  return [config.default, ...Object.values(config.types)].some((set) =>
    set.fields.some((field) => field.metric.kind === 'measurement')
  );
}

// ── evaluation ─────────────────────────────────────────────────────────────────────────────

/** Running aggregate over the values in a subtree. */
export interface Aggregate {
  sum: number;
  count: number;
  min: number;
  max: number;
}

const EMPTY_AGGREGATE: Aggregate = Object.freeze({
  sum: 0,
  count: 0,
  min: Infinity,
  max: -Infinity,
});

/** The value of a metric for one branch; `null` when there is nothing to aggregate. */
export interface RollupValue {
  value: number | null;
  /** For `ratio` display: the devices the availability is out of. */
  of?: number;
  /** For `breakdown` display: the alarm counts per severity. */
  alarms?: AlarmCounts;
}

/**
 * The metric for **every** node of the hierarchy, in one bottom-up pass — so a whole tree of
 * badges costs O(n), not O(n²). Values cover the node's subtree, the node included, except
 * `count` of assets, which counts what is *below* ("3 turbines").
 */
export function computeMetric(
  hierarchy: AssetHierarchy,
  rawMetric: RollupMetric,
  unit: 'assets' | 'devices' = 'devices'
): Map<string, RollupValue> {
  // `units` is the tree's count: assets with the Digital Twin Manager, devices without.
  const metric: RollupMetric =
    rawMetric.kind === 'count' && rawMetric.of === 'units' ? { ...rawMetric, of: unit } : rawMetric;
  const aggregates = new Map<string, Aggregate>();
  const devices = new Map<string, number>();
  const alarmTotals = new Map<string, AlarmCounts>();
  const ratio = metric.kind === 'availability';
  const breakdown = metric.kind === 'alarms';

  for (const id of postOrder(hierarchy.byId, hierarchy.rootIds)) {
    const node = hierarchy.byId.get(id);

    if (!node) continue;
    let aggregate = ownAggregate(node, metric);
    let deviceCount = ratio ? ownDeviceCount(node) : 0;
    const alarms = breakdown ? ownAlarms(node, metric.severities) : null;

    for (const childId of node.childIds) {
      const child = aggregates.get(childId);

      if (child) aggregate = merge(aggregate, child);
      if (ratio) deviceCount += devices.get(childId) ?? 0;
      if (alarms) addAlarms(alarms, alarmTotals.get(childId));
    }
    aggregates.set(id, aggregate);
    if (ratio) devices.set(id, deviceCount);
    if (alarms) alarmTotals.set(id, alarms);
  }

  const values = new Map<string, RollupValue>();

  for (const [id, aggregate] of aggregates) {
    const node = hierarchy.byId.get(id)!;
    let value = valueOf(aggregate, metric);

    // Assets are counted below the branch, not including it.
    if (metric.kind === 'count' && metric.of === 'assets' && countsAsset(node, metric)) {
      value = (value ?? 0) - 1;
    }
    values.set(id, {
      value,
      ...(ratio ? { of: devices.get(id) ?? 0 } : {}),
      ...(breakdown ? { alarms: alarmTotals.get(id) } : {}),
    });
  }

  return values;
}

function valueOf(aggregate: Aggregate, metric: RollupMetric): number | null {
  if (metric.kind !== 'property' && metric.kind !== 'measurement') return aggregate.sum;
  if (!aggregate.count) return null;

  switch (metric.fn) {
    case 'sum':
      return aggregate.sum;
    case 'avg':
      return aggregate.sum / aggregate.count;
    case 'min':
      return aggregate.min;
    case 'max':
      return aggregate.max;
  }
}

/** What the node itself (and its attached devices) contributes. */
function ownAggregate(node: AssetNode, metric: RollupMetric): Aggregate {
  switch (metric.kind) {
    case 'count': {
      if (metric.of === 'devices') {
        const own = node.isDevice && (!metric.type || node.type === metric.type) ? 1 : 0;
        const attached = node.devices.filter(
          (device) => !metric.type || device.type === metric.type
        ).length;

        return countOf(own + attached);
      }

      return countOf(countsAsset(node, metric) ? 1 : 0);
    }

    case 'availability': {
      const own = node.isDevice && node.availability === metric.state ? 1 : 0;

      return countOf(
        own + node.devices.filter((device) => device.availability === metric.state).length
      );
    }
    case 'alarms':
      return countOf(
        [node.alarms, ...node.devices.map((device) => device.alarms)].reduce(
          (total, counts) => total + sumOf(counts, metric.severities),
          0
        )
      );
    case 'alarmed':
      if (metric.of === 'assets') return countOf(sumOf(node.alarms, metric.severities) > 0 ? 1 : 0);

      return countOf(
        (node.isDevice && sumOf(node.alarms, metric.severities) > 0 ? 1 : 0) +
          node.devices.filter((device) => sumOf(device.alarms, metric.severities) > 0).length
      );

    case 'property': {
      if (metric.type && node.type !== metric.type) return EMPTY_AGGREGATE;
      const value = readNumber(node.properties, metric.path);

      return value === null ? EMPTY_AGGREGATE : single(value);
    }

    case 'measurement': {
      let aggregate = EMPTY_AGGREGATE;
      const own = readLatestValues(node.properties['c8y_LatestMeasurements'])[metric.series];

      if (own !== undefined) aggregate = merge(aggregate, single(own));

      for (const device of node.devices) {
        const value = device.latest?.[metric.series];

        if (value !== undefined) aggregate = merge(aggregate, single(value));
      }

      return aggregate;
    }
  }
}

function countsAsset(node: AssetNode, metric: { type?: string }): boolean {
  return !metric.type || node.type === metric.type;
}

function ownDeviceCount(node: AssetNode): number {
  return (node.isDevice ? 1 : 0) + node.devices.length;
}

function ownAlarms(node: AssetNode, severities: readonly AlarmSeverityKey[]): AlarmCounts {
  const counts: AlarmCounts = { critical: 0, major: 0, minor: 0, warning: 0 };

  for (const source of [node.alarms, ...node.devices.map((device) => device.alarms)]) {
    for (const severity of severities) counts[severity] += source[severity];
  }

  return counts;
}

function addAlarms(target: AlarmCounts, source: AlarmCounts | undefined): void {
  if (!source) return;

  for (const severity of ALL_SEVERITIES) target[severity] += source[severity];
}

function sumOf(counts: AlarmCounts, severities: readonly AlarmSeverityKey[]): number {
  return severities.reduce((total, severity) => total + counts[severity], 0);
}

function countOf(n: number): Aggregate {
  return n ? { sum: n, count: n, min: n, max: n } : EMPTY_AGGREGATE;
}

function single(value: number): Aggregate {
  return { sum: value, count: 1, min: value, max: value };
}

function merge(a: Aggregate, b: Aggregate): Aggregate {
  if (!b.count) return a;
  if (!a.count) return b;

  return {
    sum: a.sum + b.sum,
    count: a.count + b.count,
    min: Math.min(a.min, b.min),
    max: Math.max(a.max, b.max),
  };
}

/** A number at a dot path, or a numeric string; `null` for anything else. */
export function readNumber(source: Readonly<Record<string, unknown>>, path: string): number | null {
  let current: unknown = source;

  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return null;
    current = (current as Record<string, unknown>)[segment];
  }

  // A DTM attribute with a unit is often stored as `{ value, unit }`.
  if (current && typeof current === 'object' && 'value' in current) {
    current = current.value;
  }
  if (typeof current === 'number') return Number.isFinite(current) ? current : null;

  if (typeof current === 'string' && current.trim() !== '') {
    const n = Number(current);

    return Number.isFinite(n) ? n : null;
  }

  return null;
}

/**
 * The worst severity among `dotSeverities` with an active alarm in `counts` — the dot's colour,
 * or `null` when none of the shown severities has one.
 */
export function dotSeverity(
  counts: AlarmCounts,
  dotSeverities: readonly AlarmSeverityKey[]
): AlarmSeverityKey | null {
  return (
    ALL_SEVERITIES.find((severity) => dotSeverities.includes(severity) && counts[severity] > 0) ??
    null
  );
}

// ── labels ─────────────────────────────────────────────────────────────────────────────────

const FN_LABELS: Record<RollupFn, string> = {
  sum: gettext('Total'),
  avg: gettext('Average'),
  min: gettext('Minimum'),
  max: gettext('Maximum'),
};

/** A label for a metric, used when the field has none of its own. `unit` names `units`. */
export function metricLabel(metric: RollupMetric, unit: 'assets' | 'devices'): string {
  switch (metric.kind) {
    case 'count': {
      const of = metric.of === 'units' ? unit : metric.of;
      const base = of === 'assets' ? gettext('Assets') : gettext('Devices');

      return metric.type ? `${base} · ${metric.type}` : base;
    }
    case 'availability':
      return metric.state === 'available' ? gettext('Available') : gettext('Unavailable');
    case 'alarms':
      return metric.severities.length === ALL_SEVERITIES.length
        ? gettext('Alarms')
        : `${gettext('Alarms')} · ${severityKey(metric.severities).replace(/,/g, ', ')}`;
    case 'alarmed':
      return `${metric.of === 'assets' ? gettext('Assets') : gettext('Devices')} ${gettext('with alarms')}`;
    case 'property':
      return `${FN_LABELS[metric.fn]} · ${metric.path}`;
    case 'measurement':
      return `${FN_LABELS[metric.fn]} · ${metric.series}`;
  }
}

export const ROLLUP_FN_LABELS = FN_LABELS;

// ── normalization ──────────────────────────────────────────────────────────────────────────

/** Stored data is never trusted: malformed fields are dropped, a missing document gives defaults. */
export function normalizeRollups(raw: unknown): RollupConfig {
  if (!isRecord(raw) || raw['version'] !== ROLLUP_VERSION) return defaultRollups();
  const types: Record<string, RollupSet> = {};

  if (isRecord(raw['types'])) {
    for (const [type, set] of Object.entries(raw['types'])) {
      const normalized = normalizeRollupSet(set);

      if (type.trim() && normalized) types[type] = normalized;
    }
  }
  const dot = Array.isArray(raw['dotSeverities'])
    ? ALL_SEVERITIES.filter((severity) => (raw['dotSeverities'] as unknown[]).includes(severity))
    : [...ALL_SEVERITIES];

  return {
    version: ROLLUP_VERSION,
    types,
    default: normalizeRollupSet(raw['default']) ?? defaultRollupSet(),
    dotSeverities: dot,
  };
}

function normalizeRollupSet(raw: unknown): RollupSet | null {
  if (!isRecord(raw) || !Array.isArray(raw['fields'])) return null;
  const seen = new Set<string>();
  const fields: RollupField[] = [];

  for (const entry of raw['fields']) {
    const field = normalizeRollupField(entry);

    if (!field || seen.has(rollupFieldId(field))) continue;
    seen.add(rollupFieldId(field));
    fields.push(field);
    if (fields.length >= ROLLUP_LIMITS.maxFields) break;
  }
  const badge = typeof raw['badge'] === 'string' && seen.has(raw['badge']) ? raw['badge'] : null;

  return { fields, badge };
}

export function normalizeRollupField(raw: unknown): RollupField | null {
  if (!isRecord(raw)) return null;
  const metric = normalizeMetric(raw['metric']);

  if (!metric) return null;
  const label = typeof raw['label'] === 'string' ? raw['label'].trim() : '';

  if (label.length > ROLLUP_LIMITS.maxLabel) return null;
  const field: RollupField = { label, metric };
  const { display, unit, precision } = raw;

  if (display === 'ratio' || display === 'breakdown' || display === 'value')
    field.display = display;

  if (typeof unit === 'string' && unit.trim() && unit.length <= ROLLUP_LIMITS.maxUnit) {
    field.unit = unit.trim();
  }

  if (
    typeof precision === 'number' &&
    Number.isInteger(precision) &&
    precision >= 0 &&
    precision <= ROLLUP_LIMITS.maxPrecision
  ) {
    field.precision = precision;
  }

  return field;
}

function normalizeMetric(raw: unknown): RollupMetric | null {
  if (!isRecord(raw)) return null;
  const type =
    typeof raw['type'] === 'string' && raw['type'].trim() ? raw['type'].trim() : undefined;
  const fn = (ROLLUP_FNS as readonly unknown[]).includes(raw['fn'])
    ? (raw['fn'] as RollupFn)
    : null;
  const severities = Array.isArray(raw['severities'])
    ? ALL_SEVERITIES.filter((severity) => (raw['severities'] as unknown[]).includes(severity))
    : [];

  switch (raw['kind']) {
    case 'count':
      return raw['of'] === 'units' || raw['of'] === 'assets' || raw['of'] === 'devices'
        ? { kind: 'count', of: raw['of'], ...(type ? { type } : {}) }
        : null;
    case 'availability':
      return raw['state'] === 'available' || raw['state'] === 'unavailable'
        ? { kind: 'availability', state: raw['state'] }
        : null;
    case 'alarms':
      return severities.length ? { kind: 'alarms', severities } : null;
    case 'alarmed':
      return (raw['of'] === 'assets' || raw['of'] === 'devices') && severities.length
        ? { kind: 'alarmed', of: raw['of'], severities }
        : null;
    case 'property':
      return typeof raw['path'] === 'string' && PATH_PATTERN.test(raw['path']) && fn
        ? { kind: 'property', path: raw['path'], fn, ...(type ? { type } : {}) }
        : null;
    case 'measurement':
      return typeof raw['series'] === 'string' && SERIES_PATTERN.test(raw['series']) && fn
        ? { kind: 'measurement', series: raw['series'], fn }
        : null;
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
