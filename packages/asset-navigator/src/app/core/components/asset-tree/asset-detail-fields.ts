import { gettext } from '@c8y/ngx-components/gettext';
import { humanizeInventoryKey } from '../inventory-field-picker/inventory-field.model';
import type { DetailFieldSpec } from '../../services/asset-store/metric-spec.model';

/**
 * The detail panel's field vocabulary — data, not code (tree design §6.3, NFR-T6).
 *
 * Series names come from the IEC data model (see the `ps-data-model` skill in
 * `apps/backend/windy-agents/.flue/skills/`): keep the two in step, because these
 * identifiers are the platform's, not ours.
 *
 * Every entry here can actually be resolved: `mo` and `alarm` fields from the asset
 * store's tier-0 cache with no request at all, `measurement`/`latest` fields from one
 * `withLatestValues=true` read per asset. Nothing in this catalogue depends on the
 * aggregation service, so the panel never shows a field it cannot fill.
 */
export const DETAIL_FIELD_CATALOGUE: readonly DetailFieldSpec[] = [
  {
    label: gettext('Status'),
    render: 'status',
    spec: { key: 'status', kind: 'mo', path: 'wnd_Status' },
  },
  {
    label: gettext('Active power'),
    render: 'number',
    precision: 1,
    unit: 'kW',
    spec: { key: 'activePower', kind: 'measurement', series: 'WTUR.W', fn: 'latest', unit: 'kW' },
  },
  {
    label: gettext('Wind speed'),
    render: 'number',
    precision: 1,
    unit: 'm/s',
    spec: {
      key: 'windSpeed',
      kind: 'measurement',
      series: 'WMET.HorWdSpd',
      fn: 'latest',
      unit: 'm/s',
    },
  },
  {
    // TBA.* are trailing-window availabilities the source itself reports, so the 30-day
    // figure is a latest value — no aggregation call (see the data-model skill).
    label: gettext('Availability 30d'),
    render: 'percent',
    precision: 1,
    spec: {
      key: 'availability30d',
      kind: 'measurement',
      series: 'TBA.MoAvl',
      fn: 'latest',
      unit: '%',
    },
  },
  {
    label: gettext('Alarms'),
    render: 'alarms',
    spec: { key: 'alarms', kind: 'alarm', agg: 'count' },
  },
  {
    label: gettext('Health'),
    render: 'percent',
    precision: 0,
    spec: { key: 'health', kind: 'measurement', series: 'WPPD.Health', fn: 'latest', unit: '%' },
  },
  {
    label: gettext('Rotor speed'),
    render: 'number',
    precision: 1,
    unit: 'rpm',
    spec: {
      key: 'rotorSpeed',
      kind: 'measurement',
      series: 'WROT.RotSpd',
      fn: 'latest',
      unit: 'rpm',
    },
  },
  {
    label: gettext('Performance ratio'),
    render: 'percent',
    precision: 1,
    spec: {
      key: 'performanceRatio',
      kind: 'measurement',
      series: 'WTUR.PerfRat',
      fn: 'latest',
      unit: '%',
    },
  },
  {
    label: gettext('Nacelle direction'),
    render: 'number',
    precision: 0,
    unit: '°',
    spec: {
      key: 'nacelleDirection',
      kind: 'measurement',
      series: 'WNAC.Dir',
      fn: 'latest',
      unit: '°',
    },
  },
  {
    label: gettext('Turbine model'),
    render: 'text',
    spec: { key: 'turbineClass', kind: 'mo', path: 'turbine_class' },
  },
  {
    label: gettext('Rated power'),
    render: 'number',
    precision: 0,
    unit: 'kW',
    spec: { key: 'ratedPower', kind: 'mo', path: 'turbine_rated_power_kw' },
  },
  {
    label: gettext('Firmware'),
    render: 'text',
    spec: { key: 'firmware', kind: 'mo', path: 'turbine_firmware_version' },
  },
  {
    label: gettext('Service contract'),
    render: 'text',
    spec: { key: 'serviceContract', kind: 'mo', path: 'turbine_service_contract' },
  },
  {
    label: gettext('Operating hours'),
    render: 'number',
    precision: 0,
    unit: 'h',
    spec: { key: 'operatingHours', kind: 'mo', path: 'turbine_operating_hours' },
  },
  {
    label: gettext('Commissioned'),
    render: 'text',
    spec: { key: 'commissioningYear', kind: 'mo', path: 'commissioning_year' },
  },
  {
    // Declared ahead of the fragment existing: the moment downtime/service planning
    // writes it, the field fills in with no code change (NFR-T6).
    label: gettext('Next service'),
    render: 'date',
    spec: { key: 'nextService', kind: 'mo', path: 'wnd_NextService.date' },
  },
];

/**
 * Out of the box (OQ-T3). The spec's suggested set, with "next service" swapped for
 * "health": the service date has no fragment on the platform yet, and a permanently
 * empty row in the default panel teaches users the panel is broken. It stays one
 * checkbox away in the ⚙ panel.
 *
 * These are turbine fields, so this is the default for a **leaf** type only — see
 * {@link resolveDetailFieldKeys}.
 */
export const DEFAULT_DETAIL_FIELD_KEYS: readonly string[] = [
  'status',
  'activePower',
  'windSpeed',
  'availability30d',
  'alarms',
  'health',
];

/**
 * Prefix of a **custom** field key: `mo:<dot path>`, e.g. `mo:wnd_Owner.company`.
 *
 * The key *is* the whole specification — a path into the managed object, resolved from
 * the asset store's tier-0 properties with no request, and a label derived from the last
 * path segment. That is deliberate: the alternative (storing label + type alongside)
 * makes the per-user preference a document that can disagree with itself after a rename,
 * and there is nothing in it a reader could not re-derive.
 */
export const CUSTOM_FIELD_KEY_PREFIX = 'mo:';

/** The key a picked inventory path is stored under. */
export function customFieldKey(path: string): string {
  return `${CUSTOM_FIELD_KEY_PREFIX}${path}`;
}

/** The field a `mo:<path>` key describes, or `undefined` when it is not one. */
export function customDetailField(key: string): DetailFieldSpec | undefined {
  if (!key.startsWith(CUSTOM_FIELD_KEY_PREFIX)) return undefined;
  const path = key.slice(CUSTOM_FIELD_KEY_PREFIX.length);

  if (!path) return undefined;
  const leaf = path.split('.').at(-1) ?? path;
  return {
    label: humanizeInventoryKey(leaf),
    // No unit and no precision: nothing declares them for a free-picked path, and
    // inventing one would put a wrong unit next to a real number.
    render: 'text',
    spec: { key, kind: 'mo', path },
  };
}

/** A catalogue entry only. Prefer {@link detailFieldFor}, which also knows custom keys. */
export function detailFieldByKey(key: string): DetailFieldSpec | undefined {
  return DETAIL_FIELD_CATALOGUE.find((field) => field.spec.key === key);
}

/** Any known field: a catalogue entry, or a user-picked inventory path. */
export function detailFieldFor(key: string): DetailFieldSpec | undefined {
  return detailFieldByKey(key) ?? customDetailField(key);
}

/**
 * What a **branch** (a region, area, park) can usefully show. Measurement and alarm
 * fields are excluded, not filtered out later: a group has no `IECMeasurement` series of
 * its own, so offering "wind speed" for a park would only ever add a dash — and its
 * subtree alarms are already in the rollup rows the panel always renders.
 */
export function branchFieldCatalogue(): readonly DetailFieldSpec[] {
  return DETAIL_FIELD_CATALOGUE.filter(
    (field) => field.spec.kind === 'mo' && field.render !== 'status'
  );
}

/**
 * The keys a panel renders, from what the user configured **for that asset type**.
 *
 * The two defaults differ in kind, which is why this decision is not in the store:
 * a leaf falls back to the turbine set (an empty turbine panel is not a valid state,
 * so an empty selection means "never configured"), while a branch falls back to
 * *nothing* — its identity is the rollup rows the panel always renders, and configured
 * fields are additions to them.
 */
export function resolveDetailFieldKeys(
  configured: readonly string[] | null | undefined,
  isBranch: boolean
): readonly string[] {
  if (isBranch) return configured ?? [];

  return configured?.length ? configured : DEFAULT_DETAIL_FIELD_KEYS;
}

/** Series a set of selected fields needs, for the one latest-values read. */
export function seriesFor(keys: readonly string[]): string[] {
  return keys
    .map((key) => detailFieldFor(key)?.spec)
    .filter((spec) => spec?.kind === 'measurement')
    .map((spec) => (spec as { series: string }).series);
}
