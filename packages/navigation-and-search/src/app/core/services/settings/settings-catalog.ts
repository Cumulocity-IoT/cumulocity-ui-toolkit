import type { AssetHierarchy } from '../asset-store/asset-store.model';
import { readLatestValues } from '../asset-store/asset-rollup';

/**
 * What the cached hierarchy offers the settings editors to pick from — property paths with
 * sample values, measurement series, device types. Pure: read off the asset store's hierarchy,
 * no request.
 */

/** A property path found on assets, with up to a few distinct values seen. */
export interface PropertyOption {
  path: string;
  numeric: boolean;
  values: string[];
}

/** How deep fragments are walked: `fragment.sub.leaf`. */
const MAX_DEPTH = 3;
const MAX_VALUES = 25;
/** Bookkeeping and fragments with dedicated handling — never offered. */
const SKIP = new Set([
  'creationTime',
  'lastUpdated',
  'owner',
  'c8y_LatestMeasurements',
  'c8y_IsAsset',
  'c8y_IsDevice',
  'c8y_IsDeviceGroup',
  'c8y_Availability',
  'c8y_ActiveAlarmsStatus',
]);

/**
 * Leaf paths of the assets of `type` (any type when `null`), primitive values only, sorted by
 * path. `{ value, unit }` objects count as their value — a DTM attribute with a unit.
 */
export function propertyOptions(
  hierarchy: AssetHierarchy | null | undefined,
  type: string | null
): PropertyOption[] {
  const found = new Map<string, { numeric: boolean; values: Set<string> }>();

  for (const node of hierarchy?.byId.values() ?? []) {
    if (type !== null && node.type !== type) continue;
    walk(node.properties, '', 0, (path, value) => {
      const entry = found.get(path) ?? { numeric: true, values: new Set<string>() };

      entry.numeric &&= isNumeric(value);
      if (entry.values.size < MAX_VALUES) entry.values.add(String(value));
      found.set(path, entry);
    });
  }

  return [...found]
    .map(([path, entry]) => ({ path, numeric: entry.numeric, values: [...entry.values].sort() }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** A number, or a string that is one — `readNumber` aggregates both. */
function isNumeric(value: string | number | boolean): boolean {
  if (typeof value === 'number') return Number.isFinite(value);

  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value));
}

function walk(
  source: unknown,
  prefix: string,
  depth: number,
  visit: (path: string, value: string | number | boolean) => void
): void {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return;

  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (depth === 0 && SKIP.has(key)) continue;
    if (/\s/.test(key) || key.includes('.')) continue;
    const path = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      visit(path, value);
    } else if (value && typeof value === 'object' && 'value' in value) {
      const inner = value.value;

      if (typeof inner === 'number' || typeof inner === 'string') visit(path, inner);
    } else if (depth + 1 < MAX_DEPTH) {
      walk(value, path, depth + 1, visit);
    }
  }
}

/** Measurement series with a latest value on any asset or device of the hierarchy, sorted. */
export function measurementSeries(hierarchy: AssetHierarchy | null | undefined): string[] {
  const series = new Set<string>();

  for (const node of hierarchy?.byId.values() ?? []) {
    for (const key of Object.keys(readLatestValues(node.properties['c8y_LatestMeasurements']))) {
      series.add(key);
    }

    for (const device of node.devices) {
      for (const key of Object.keys(device.latest ?? {})) series.add(key);
    }
  }

  return [...series].sort();
}

/** Types of the devices attached to the hierarchy's assets, sorted. */
export function deviceTypes(hierarchy: AssetHierarchy | null | undefined): string[] {
  const types = new Set<string>();

  for (const node of hierarchy?.byId.values() ?? []) {
    if (node.isDevice && node.type) types.add(node.type);
    for (const device of node.devices) if (device.type) types.add(device.type);
  }

  return [...types].sort();
}
