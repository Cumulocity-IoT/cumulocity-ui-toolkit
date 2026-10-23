import { splitByCase, upperFirst } from 'scule';
import type { AssetDefinition, AssetPropertyDefinition } from '@c8y/ngx-components';

/**
 * DTM asset/property definitions → the list of managed-object paths worth indexing for
 * search, per asset type.
 *
 * The point of going through DTM at all: an asset's fragments are *configured*, not
 * guessed. `GET /service/dtm/definitions/assets` says which properties an asset of a
 * given type carries and whether the model considers them required, and
 * `GET /service/dtm/definitions/properties` carries the human label the rest of the UI
 * shows for each one. Indexing `"Serial number A-1234"` rather than
 * `"c8y_Hardware.serialNumber A-1234"` is what makes the search field answer the
 * question a user would actually type.
 *
 * Everything here is pure — the fetching lives in `AssetDefinitionService`.
 */

/** One indexable leaf of an asset's managed object. */
export interface IndexableProperty {
  /** Dotted path into `AssetNode.properties`, e.g. `c8y_Hardware.serialNumber`. */
  path: string;
  /** Human label, from the property definition's `jsonSchema.title` where there is one. */
  label: string;
  /**
   * The asset definition marks this property `minOccurs: '1'`. Required properties are
   * identity-bearing (serial, model, rated power) rather than incidental, so a hit in one
   * outranks a hit in a free-form fragment — see `asset-search.ts`.
   */
  required: boolean;
}

/** Indexable properties per asset type (the managed object's `type`). */
export type AssetIndexablePropertyMap = ReadonlyMap<string, readonly IndexableProperty[]>;

/**
 * How deep to walk a property's JSON schema. Two levels covers every real fragment
 * (`c8y_Hardware.serialNumber`); deeper nestings are configuration blobs, not things a
 * user searches by name.
 */
const MAX_SCHEMA_DEPTH = 2;

/** Leaves worth indexing. Objects and arrays are containers, not values. */
const INDEXABLE_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'enum']);

/**
 * Fragments that are never useful search terms: platform bookkeeping, geometry, and the
 * status/alarm fragments that `AssetNode` already projects into dedicated search fields.
 */
const SKIP_PROPERTIES = new Set([
  // These have dedicated, differently-weighted search fields of their own
  // (`asset-search.ts`); indexing them here as well would double-count them.
  'c8y_Notes',
  'c8y_ExternalId',
  'c8y_ExternalAsset',
  'c8y_Position',
  'c8y_ActiveAlarmsStatus',
  'c8y_IsAsset',
  'c8y_IsDeviceGroup',
  'c8y_LinkedSeries',
  'c8y_LatestMeasurements',
  'wnd_Status',
  'creationTime',
  'lastUpdated',
  'owner',
  'self',
  'additionParents',
  'assetParents',
  'deviceParents',
  'childAdditions',
]);

/** Longest value still worth indexing — beyond this it is a document, not an identifier. */
export const MAX_INDEXABLE_VALUE_LENGTH = 64;

interface SchemaNode {
  type?: unknown;
  title?: string;
  format?: string;
  properties?: Record<string, SchemaNode>;
  [key: string]: unknown;
}

/**
 * `c8y_Hardware` → `Hardware`, `serialNumber` → `Serial number`.
 *
 * The vendor prefix goes: nobody searches for "c8y", and leaving it in would put a token
 * shared by half the fleet into the index.
 */
export function humanizeKey(key: string): string {
  const withoutPrefix = key.replace(/^[a-z][a-z0-9]*_/i, '');
  return upperFirst(splitByCase(withoutPrefix).join(' ').toLowerCase());
}

function schemaTypeOf(node: SchemaNode): string {
  const type = node.type;

  if (typeof type === 'string') return type;

  // `['string', 'null']` — a nullable scalar; the first non-null entry is the real type.
  if (Array.isArray(type)) {
    const first = (type as unknown[]).find(
      (entry) => typeof entry === 'string' && entry !== 'null'
    );

    if (typeof first === 'string') return first;
  }
  if (node['enum']) return 'enum';

  return '';
}

/**
 * One property definition → its indexable leaves.
 *
 * A scalar schema yields the fragment itself (`c8y_Notes`); an object schema yields its
 * scalar children (`c8y_Hardware.model`) and stops there, because a fragment's own name
 * is not a value anyone searches for once its children are indexed.
 */
export function indexableLeaves(
  identifier: string,
  schema: SchemaNode | undefined,
  required: boolean
): IndexableProperty[] {
  if (SKIP_PROPERTIES.has(identifier)) return [];
  const leaves: IndexableProperty[] = [];

  const walk = (node: SchemaNode | undefined, path: string, label: string, depth: number): void => {
    if (!node) {
      // No schema at all: index the fragment itself and let the value-reader decide
      // whether what is actually on the managed object is a scalar.
      leaves.push({ path, label, required });

      return;
    }
    const children = node.properties;

    if (children && depth < MAX_SCHEMA_DEPTH) {
      for (const [key, child] of Object.entries(children)) {
        walk(child, `${path}.${key}`, child.title ?? humanizeKey(key), depth + 1);
      }

      return;
    }
    // `date-time` values are timestamps — they tokenize into noise and match nothing a
    // user would type.
    if (node.format === 'date-time' || node['printFormat'] === 'datetime') return;
    if (children) return; // an object at max depth: nothing scalar to index
    if (INDEXABLE_TYPES.has(schemaTypeOf(node))) leaves.push({ path, label, required });
  };

  walk(schema, identifier, schema?.title ?? humanizeKey(identifier), 0);

  return leaves;
}

/**
 * The whole projection: asset definitions × property definitions → what to index per type.
 *
 * `AssetDefinition.identifier` is the managed object's `type`, which is the key the search
 * index looks up.
 */
export function buildIndexablePropertyMap(
  assetDefinitions: readonly AssetDefinition[],
  propertyDefinitions: readonly AssetPropertyDefinition[]
): AssetIndexablePropertyMap {
  const schemas = new Map<string, SchemaNode | undefined>();

  for (const definition of propertyDefinitions) {
    schemas.set(definition.identifier, definition.jsonSchema);
  }

  const map = new Map<string, readonly IndexableProperty[]>();

  for (const definition of assetDefinitions) {
    const allowed = (
      definition['composition'] as
        | { allowedProperties?: { identifier?: string; minOccurs?: string }[] }
        | undefined
    )?.allowedProperties;

    if (!allowed?.length) continue;

    const properties: IndexableProperty[] = [];

    for (const entry of allowed) {
      if (!entry?.identifier) continue;
      properties.push(
        ...indexableLeaves(entry.identifier, schemas.get(entry.identifier), entry.minOccurs === '1')
      );
    }
    if (properties.length) map.set(definition.identifier, properties);
  }

  return map;
}

/**
 * The heuristic fallback for a type DTM knows nothing about — an unsubscribed DTM, a
 * tenant that models its fleet in plain managed objects, a type with no definition.
 *
 * Search must never be *worse* than it was because a definition is missing, so this walks
 * the managed object itself under the same rules the schema-driven path applies: bounded
 * depth, scalars only, the same skip list.
 */
export function fallbackIndexableProperties(
  properties: Readonly<Record<string, unknown>>
): IndexableProperty[] {
  const leaves: IndexableProperty[] = [];

  const walk = (value: unknown, path: string, label: string, depth: number): void => {
    if (leaves.length >= 40) return;
    if (value === null || value === undefined) return;

    if (typeof value === 'object') {
      if (Array.isArray(value) || depth >= MAX_SCHEMA_DEPTH) return;

      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, `${path}.${key}`, humanizeKey(key), depth + 1);
      }

      return;
    }
    leaves.push({ path, label, required: false });
  };

  for (const [key, value] of Object.entries(properties)) {
    if (SKIP_PROPERTIES.has(key)) continue;
    walk(value, key, humanizeKey(key), 0);
  }

  return leaves;
}

/** Reads a dotted path out of a managed object's `properties`. */
export function readPath(properties: Readonly<Record<string, unknown>>, path: string): unknown {
  let current: unknown = properties;

  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/**
 * `"<label> <value>"` per property that actually has an indexable value, joined into the
 * one text field MiniSearch indexes.
 *
 * The label travels with the value on purpose: it is what makes `"serial 1234"` an AND
 * query that lands, instead of requiring the user to know the fragment key.
 */
export function indexableText(
  properties: Readonly<Record<string, unknown>>,
  indexable: readonly IndexableProperty[]
): string {
  const parts: string[] = [];

  for (const property of indexable) {
    const value = readPath(properties, property.path);

    if (!isScalar(value)) continue;
    const text = String(value);

    if (!text || text.length > MAX_INDEXABLE_VALUE_LENGTH) continue;
    parts.push(`${property.label} ${text}`);
  }

  return parts.join(' ');
}

/** The paths whose values matched, so a result row can say *why* it matched. */
export function matchingProperties(
  properties: Readonly<Record<string, unknown>>,
  indexable: readonly IndexableProperty[],
  terms: readonly string[]
): IndexableProperty[] {
  if (!terms.length) return [];

  return indexable.filter((property) => {
    const value = readPath(properties, property.path);

    if (!isScalar(value)) return false;
    const haystack = `${property.label} ${String(value)}`.toLowerCase();
    return terms.some((term) => haystack.includes(term.toLowerCase()));
  });
}

/** Scalars `String()` renders meaningfully (objects are handled separately by callers). */
function isScalar(value: unknown): value is string | number | boolean | bigint {
  const kind = typeof value;
  return kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint';
}
