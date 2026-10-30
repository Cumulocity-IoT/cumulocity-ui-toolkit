import type { AssetPropertyType } from '@c8y/ngx-components/asset-properties';
import { humanizeInventoryKey } from '../inventory-field-picker/inventory-field.model';
import {
  DEFAULT_DETAIL_FIELDS,
  PROPERTY_PATH_PATTERN,
  type DetailField,
} from '../../services/settings/detail-panel.model';

/**
 * Helpers around the detail panel's data contract (`DetailPanelConfig`, in
 * `services/settings/detail-panel.model.ts`): the editor's field vocabulary, and what a set of
 * fields needs fetched.
 *
 * Every source the contract allows can actually be resolved: `property`, `alarms`,
 * `availability`, `lastUpdated` and `type` from the asset store's tier-0 cache with no request
 * at all, `measurement` (`latest`) from one `withLatestValues=true` read per asset.
 */

/** What the ⚙ editor offers besides picked inventory properties: the built-in defaults. */
export const DETAIL_FIELD_CATALOGUE: readonly DetailField[] = DEFAULT_DETAIL_FIELDS;

/**
 * What a **branch** can usefully add. Availability and alarms are excluded: the branch's
 * subtree rows (always rendered) already state both.
 */
export function branchFieldCatalogue(): readonly DetailField[] {
  return DETAIL_FIELD_CATALOGUE.filter(
    (field) => field.source.kind !== 'availability' && field.source.kind !== 'alarms'
  );
}

/**
 * The field for an inventory path picked in the field picker: labelled after its last segment
 * (`c8y_Hardware.serialNumber` → "Serial Number"), no unit — nothing declares one for a
 * free-picked path, and inventing one would put a wrong unit next to a real number.
 */
export function propertyField(path: string): DetailField {
  const leaf = path.split('.').at(-1) ?? path;

  return { label: humanizeInventoryKey(leaf), source: { kind: 'property', path } };
}

/**
 * The field for a property picked in the platform's asset property list (`c8y-asset-property-list`,
 * in `AssetPropertyPickerDrawerComponent`): its key path (`['c8y_Hardware', 'serialNumber']`),
 * or its name for a top-level property. Labelled as the list showed it when that is a real label
 * (DTM, asset library); a bare key (`hub_height_m`) is humanized instead. `null` for what the
 * panel cannot read from the cached managed object: computed properties, whole objects (the list
 * offers their leaves) and paths the data contract rejects.
 */
export function assetPropertyField(property: AssetPropertyType): DetailField | null {
  if (property.computed || property.type === 'object') return null;
  const keyPath = (property as { keyPath?: unknown }).keyPath;
  const path = Array.isArray(keyPath) && keyPath.length ? keyPath.join('.') : property.name;

  if (!path || !PROPERTY_PATH_PATTERN.test(path)) return null;
  const label = property.label?.trim();

  return label && label !== property.name
    ? { label, source: { kind: 'property', path } }
    : propertyField(path);
}

/** Measurement series (`fragment.series`) a set of fields needs, for the one latest-values read. */
export function seriesFor(fields: readonly DetailField[]): string[] {
  return fields
    .map((field) => field.source)
    .filter((source) => source.kind === 'measurement')
    .map((source) => (source as { series: string }).series);
}

/** Dot-path read used by `property` fields. */
export function readPath(source: unknown, path: string): unknown {
  let current = source;

  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
