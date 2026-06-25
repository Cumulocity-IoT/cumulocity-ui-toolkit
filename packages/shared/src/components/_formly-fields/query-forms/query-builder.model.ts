import { QueriesUtil } from '@c8y/client';
import { ReverseQueriesUtil } from '~components/query-display/reverse-queries-util';
import type { QueryJson } from '~components/query-display/reverse-queries-util.model';

/**
 * Comparison operators supported by the Cumulocity inventory query language and
 * serialisable by `QueriesUtil.buildQuery()`. Note there is intentionally no
 * `ne`: the SDK cannot serialise it — inequality is expressed as
 * `not(<field> eq <value>)`, which the builder supports via a `not` node.
 */
export type BuilderOp = 'eq' | 'lt' | 'le' | 'gt' | 'ge';

/** How a comparison value should be serialised (drives quoting). */
export type BuilderValueType = 'string' | 'number' | 'null';

export type BuilderKind =
  | 'and'
  | 'or'
  | 'not'
  | 'comparison'
  | 'has'
  | 'hasany'
  | 'bygroupid'
  | 'isinhierarchyof';

/**
 * A single node in the query-builder tree.
 *
 * Intentionally a *flat* shape (all kind-specific properties optional) rather
 * than a discriminated union. The recursive builder template binds to these
 * fields directly, and Angular's strict template type-checker does not narrow a
 * union by a `kind` switch the way TypeScript does — a flat interface keeps the
 * template type-safe without casts.
 */
export interface BuilderNode {
  kind: BuilderKind;
  /** Children of an `and` / `or` group. */
  children?: BuilderNode[];
  /** The single negated child of a `not` node. */
  child?: BuilderNode;
  /** `comparison` field path. */
  field?: string;
  /** `comparison` operator. */
  operator?: BuilderOp;
  /** `comparison` value type. */
  valueType?: BuilderValueType;
  /** `comparison` raw value (kept as string; coerced on serialise). */
  value?: string;
  /** `has` fragment name. */
  fragment?: string;
  /** `hasany` fragment names, comma-separated. */
  fragments?: string;
  /** `bygroupid` / `isinhierarchyof` ids, comma-separated. */
  ids?: string;
}

const queriesUtil = new QueriesUtil();
const reverseUtil = new ReverseQueriesUtil();

// ---------------------------------------------------------------------------
// Node factory
// ---------------------------------------------------------------------------

export function makeNode(kind: BuilderKind): BuilderNode {
  switch (kind) {
    case 'and':
    case 'or':
      return { kind, children: [] };
    case 'not':
      return { kind: 'not', child: makeComparison() };
    case 'has':
      return { kind: 'has', fragment: '' };
    case 'hasany':
      return { kind: 'hasany', fragments: '' };
    case 'bygroupid':
      return { kind: 'bygroupid', ids: '' };
    case 'isinhierarchyof':
      return { kind: 'isinhierarchyof', ids: '' };
    case 'comparison':
    default:
      return makeComparison();
  }
}

function makeComparison(): BuilderNode {
  return { kind: 'comparison', field: '', operator: 'eq', valueType: 'string', value: '' };
}

export function isGroup(node: BuilderNode): boolean {
  return node.kind === 'and' || node.kind === 'or';
}

// ---------------------------------------------------------------------------
// Serialisation: BuilderNode → query string
// ---------------------------------------------------------------------------

/**
 * Serialises a builder tree to a bare Cumulocity query clause string (no
 * `$filter=` wrapper). Returns `''` when the tree contains no complete clause.
 */
export function serializeNode(root: BuilderNode): string {
  const json = nodeToJson(root);

  if (!json) {
    return '';
  }

  return unwrapQuery(queriesUtil.buildQuery(json));
}

/**
 * Converts a builder node to the `QueryJson` shape consumed by
 * `QueriesUtil.buildQuery()`. Incomplete nodes (empty field, empty group, …)
 * collapse to `null` so they are pruned from the output.
 */
export function nodeToJson(node: BuilderNode): QueryJson | null {
  switch (node.kind) {
    case 'and':
    case 'or': {
      const kids = (node.children ?? [])
        .map(nodeToJson)
        .filter((c): c is QueryJson => c !== null);

      if (kids.length === 0) {
        return null;
      }
      if (kids.length === 1) {
        return kids[0];
      }

      return node.kind === 'and' ? { __and: kids } : { __or: kids };
    }

    case 'not': {
      const child = node.child ? nodeToJson(node.child) : null;

      return child ? { __not: child } : null;
    }

    case 'has': {
      const fragment = (node.fragment ?? '').trim();

      return fragment ? { __has: fragment } : null;
    }

    case 'hasany': {
      const arr = splitStrings(node.fragments);

      return arr.length ? { __hasany: arr } : null;
    }

    case 'bygroupid': {
      const nums = splitNumbers(node.ids);

      return nums.length ? { __bygroupid: nums.length === 1 ? nums[0] : nums } : null;
    }

    case 'isinhierarchyof': {
      const nums = splitNumbers(node.ids);

      return nums.length ? { __isinhierarchyof: nums.length === 1 ? nums[0] : nums } : null;
    }

    case 'comparison': {
      const field = (node.field ?? '').trim();

      if (!field) {
        return null;
      }

      const value = coerceValue(node);
      const operator = node.operator ?? 'eq';

      if (operator === 'eq') {
        return { [field]: value };
      }

      return { [field]: { [`__${operator}`]: value } };
    }

    default:
      return null;
  }
}

function coerceValue(node: BuilderNode): string | number | null {
  if (node.valueType === 'null') {
    return null;
  }

  const raw = node.value ?? '';

  if (node.valueType === 'number') {
    const num = Number(raw);

    return raw !== '' && !isNaN(num) ? num : raw;
  }

  return raw;
}

// ---------------------------------------------------------------------------
// Parsing: query string → BuilderNode
// ---------------------------------------------------------------------------

/**
 * Parses a query string into a builder tree, always rooted at a group node so
 * the editor can present a top-level AND/OR combinator. A single top-level leaf
 * is wrapped in an `and` group (which serialises back without the wrapper).
 *
 * Returns `null` when the string cannot be parsed.
 */
export function parseToRoot(query: string): BuilderNode | null {
  const json = reverseUtil.buildQueryJSON(query);

  if (!json) {
    return null;
  }

  const node = jsonToNode(json);

  if (!node) {
    return null;
  }

  return isGroup(node) ? node : { kind: 'and', children: [node] };
}

/** Whether a query string can be parsed back into a builder tree. */
export function isParseable(query: string): boolean {
  return reverseUtil.buildQueryJSON(query) !== null;
}

export function jsonToNode(json: QueryJson): BuilderNode | null {
  if ('__and' in json) {
    return { kind: 'and', children: mapChildren((json as { __and: QueryJson[] }).__and) };
  }

  if ('__or' in json) {
    return { kind: 'or', children: mapChildren((json as { __or: QueryJson[] }).__or) };
  }

  if ('__not' in json) {
    const child = jsonToNode((json as { __not: QueryJson }).__not);

    return child ? { kind: 'not', child } : null;
  }

  if ('__has' in json) {
    return { kind: 'has', fragment: String((json as { __has: string }).__has) };
  }

  if ('__hasany' in json) {
    const arr = (json as { __hasany: string[] }).__hasany ?? [];

    return { kind: 'hasany', fragments: arr.join(', ') };
  }

  if ('__bygroupid' in json) {
    return { kind: 'bygroupid', ids: numbersToString((json as { __bygroupid: number | number[] }).__bygroupid) };
  }

  if ('__isinhierarchyof' in json) {
    return {
      kind: 'isinhierarchyof',
      ids: numbersToString((json as { __isinhierarchyof: number | number[] }).__isinhierarchyof),
    };
  }

  // Comparison: a single non-operator key.
  const keys = Object.keys(json).filter((k) => !k.startsWith('__'));

  if (keys.length === 1) {
    return rawToComparison(keys[0], (json as Record<string, unknown>)[keys[0]]);
  }

  return null;
}

function mapChildren(nodes: QueryJson[]): BuilderNode[] {
  return (nodes ?? []).map(jsonToNode).filter((n): n is BuilderNode => n !== null);
}

function rawToComparison(field: string, raw: unknown): BuilderNode | null {
  if (raw === null) {
    return { kind: 'comparison', field, operator: 'eq', valueType: 'null', value: '' };
  }

  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') {
    const [valueType, value] = valueTypeOf(raw);

    return { kind: 'comparison', field, operator: 'eq', valueType, value };
  }

  if (raw && typeof raw === 'object') {
    for (const op of ['lt', 'le', 'gt', 'ge'] as BuilderOp[]) {
      const opKey = `__${op}`;

      if (opKey in (raw as object)) {
        const [valueType, value] = valueTypeOf((raw as Record<string, unknown>)[opKey]);

        return { kind: 'comparison', field, operator: op, valueType, value };
      }
    }
  }

  return null;
}

function valueTypeOf(v: unknown): [BuilderValueType, string] {
  if (v === null) {
    return ['null', ''];
  }
  if (typeof v === 'number') {
    return ['number', String(v)];
  }

  return ['string', String(v)];
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Strips a `$filter=` prefix and one layer of surrounding parentheses. */
export function unwrapQuery(query: string): string {
  let s = query.trim();

  if (s.startsWith('$filter=')) {
    s = s.slice('$filter='.length).trim();
  }
  if (s.startsWith('(') && s.endsWith(')')) {
    s = s.slice(1, -1).trim();
  }

  return s;
}

function splitStrings(value?: string): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitNumbers(value?: string): number[] {
  return splitStrings(value)
    .map(Number)
    .filter((n) => !isNaN(n));
}

function numbersToString(v: number | number[]): string {
  return Array.isArray(v) ? v.join(', ') : String(v);
}
