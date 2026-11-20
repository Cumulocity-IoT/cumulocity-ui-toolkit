import {
  ALARM_SEVERITIES,
  type AlarmSeverityKey,
  type AssetHierarchy,
  type AssetNode,
  type AssetRollup,
} from '../asset-store/asset-store.model';
import { computeRollup } from '../asset-store/asset-rollup';
import { readNumber } from './rollup.model';

/**
 * The **tree filter** data contract: conditions that always narrow the asset tree, set in the
 * settings drawer's "Tree filter" tab and stored with the navigator settings
 * (`NavigatorSettings.treeFilter`).
 *
 * Each condition is checked on the assets of one type (a level of the hierarchy). An asset of
 * that type that fails any of its conditions is hidden with everything below it; assets of other
 * types are not tested. With {@link TreeFilterConfig.hideEmpty} a group the filter emptied goes
 * too, so "farms in area West" does not leave every region standing with nothing in it.
 *
 * It narrows the tree only — its search field, expand-all and footer included. The global search
 * and Pinned & Recent still reach every asset.
 */
export interface TreeFilterConfig {
  version: 1;
  /** Off keeps the conditions but shows the whole tree. */
  enabled: boolean;
  /** All must hold. Empty = no filter. */
  conditions: TreeFilterCondition[];
  /** Hide groups that had children and lost all of them to the filter. */
  hideEmpty: boolean;
}

export interface TreeFilterCondition {
  /** The managed-object `type` the condition is checked on. */
  type: string;
  test: TreeFilterTest;
}

export type PropertyOperator = 'equals' | 'notEquals' | 'contains' | 'exists' | 'gt' | 'lt';

export type TreeFilterTest =
  /** A fragment path compared to `value` (case-insensitive for text). */
  | { kind: 'property'; path: string; op: PropertyOperator; value?: string }
  /** At least one active alarm of `atLeast` or worse in the asset's subtree. */
  | { kind: 'alarms'; atLeast: AlarmSeverityKey }
  /** At least one unavailable device in the asset's subtree. */
  | { kind: 'unavailable' };

export const TREE_FILTER_VERSION = 1;
export const PROPERTY_OPERATORS: readonly PropertyOperator[] = [
  'equals',
  'notEquals',
  'contains',
  'exists',
  'gt',
  'lt',
];
export const TREE_FILTER_LIMITS = { maxConditions: 20, maxValue: 200 } as const;

const PATH_PATTERN = /^[^.\s]+(\.[^.\s]+)*$/;

export function defaultTreeFilter(): TreeFilterConfig {
  return { version: TREE_FILTER_VERSION, enabled: true, conditions: [], hideEmpty: true };
}

/** The filter narrows the tree right now. */
export function treeFilterActive(config: TreeFilterConfig): boolean {
  return config.enabled && config.conditions.length > 0;
}

/** Whether one asset passes one test. `rollup` is its subtree's, from the full hierarchy. */
export function passes(node: AssetNode, rollup: AssetRollup, test: TreeFilterTest): boolean {
  switch (test.kind) {
    case 'alarms': {
      const worstAllowed = ALARM_SEVERITIES.indexOf(test.atLeast);

      return ALARM_SEVERITIES.some(
        (severity, index) => index <= worstAllowed && rollup.alarms[severity] > 0
      );
    }
    case 'unavailable':
      return rollup.unavailableCount > 0 || node.availability === 'unavailable';
    case 'property':
      return propertyPasses(readPath(node.properties, test.path), test.op, test.value ?? '');
  }
}

function propertyPasses(raw: unknown, op: PropertyOperator, expected: string): boolean {
  const present = raw !== undefined && raw !== null && raw !== '';

  if (op === 'exists') return present;

  if (op === 'gt' || op === 'lt') {
    const actual = readNumber({ v: raw }, 'v');
    const limit = Number(expected);

    if (actual === null || expected.trim() === '' || !Number.isFinite(limit)) return false;

    return op === 'gt' ? actual > limit : actual < limit;
  }
  const actual = present ? textOf(raw).toLowerCase() : '';
  const want = expected.trim().toLowerCase();

  switch (op) {
    case 'equals':
      return present && actual === want;
    case 'notEquals':
      return actual !== want;
    case 'contains':
      return present && actual.includes(want);
  }
}

function textOf(raw: unknown): string {
  if (raw && typeof raw === 'object' && 'value' in raw) return textOf(raw.value);

  if (typeof raw === 'string') return raw;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);

  return JSON.stringify(raw) ?? '';
}

function readPath(source: Readonly<Record<string, unknown>>, path: string): unknown {
  let current: unknown = source;

  for (const segment of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

/** Result of {@link applyTreeFilter}. */
export interface FilteredTree {
  hierarchy: AssetHierarchy;
  /** Assets the filter hides. */
  hidden: number;
}

/**
 * The hierarchy the tree shows: `null` when the filter is not active (use the store's as is).
 * Hidden assets leave `byId`, `rootIds` and their parents' `childIds`; the rollup is recomputed
 * over what is left, so counts and status dots describe the visible tree. Conditions are tested
 * against the **full** rollup — "farms with a major alarm" asks about the farm, not about what
 * the filter left of it.
 */
export function applyTreeFilter(
  hierarchy: AssetHierarchy,
  config: TreeFilterConfig
): FilteredTree | null {
  if (!treeFilterActive(config)) return null;
  const byType = new Map<string, TreeFilterTest[]>();

  for (const condition of config.conditions) {
    byType.set(condition.type, [...(byType.get(condition.type) ?? []), condition.test]);
  }
  const removed = new Set<string>();
  const fails = (node: AssetNode) => {
    const tests = byType.get(node.type);
    const rollup = hierarchy.rollup.get(node.id);

    return !!tests && !!rollup && tests.some((test) => !passes(node, rollup, test));
  };

  // Top-down, so a removed asset takes its whole subtree with it.
  const stack = [...hierarchy.rootIds];
  const visited = new Set<string>();

  while (stack.length) {
    const id = stack.pop()!;

    if (visited.has(id)) continue;
    visited.add(id);
    const node = hierarchy.byId.get(id);

    if (!node) continue;

    if (fails(node)) {
      markSubtree(hierarchy, id, removed);
      continue;
    }
    stack.push(...node.childIds);
  }

  // Nodes no root reaches are tested on their own.
  for (const node of hierarchy.byId.values()) {
    if (!visited.has(node.id) && !removed.has(node.id) && fails(node)) {
      markSubtree(hierarchy, node.id, removed);
    }
  }

  if (config.hideEmpty) removeEmptied(hierarchy, removed);
  if (!removed.size) return { hierarchy, hidden: 0 };

  const byId = new Map<string, AssetNode>();

  for (const [id, node] of hierarchy.byId) {
    if (removed.has(id)) continue;
    const childIds = node.childIds.filter((childId) => !removed.has(childId));

    byId.set(id, childIds.length === node.childIds.length ? node : { ...node, childIds });
  }
  const rootIds = hierarchy.rootIds.filter((id) => !removed.has(id));

  return {
    hierarchy: {
      ...hierarchy,
      byId,
      rootIds,
      rollup: computeRollup(byId, rootIds, null, hierarchy.pendingChildren),
    },
    hidden: removed.size,
  };
}

function markSubtree(hierarchy: AssetHierarchy, id: string, removed: Set<string>): void {
  const stack = [id];

  while (stack.length) {
    const current = stack.pop()!;

    if (removed.has(current)) continue;
    removed.add(current);
    stack.push(...(hierarchy.byId.get(current)?.childIds ?? []));
  }
}

/** Repeatedly drops groups whose children were all removed (bottom-up, until stable). */
function removeEmptied(hierarchy: AssetHierarchy, removed: Set<string>): void {
  let changed = removed.size > 0;

  while (changed) {
    changed = false;

    for (const node of hierarchy.byId.values()) {
      if (
        !removed.has(node.id) &&
        node.childIds.length > 0 &&
        node.childIds.every((childId) => removed.has(childId))
      ) {
        removed.add(node.id);
        changed = true;
      }
    }
  }
}

// ── normalization ──────────────────────────────────────────────────────────────────────────

export function normalizeTreeFilter(raw: unknown): TreeFilterConfig {
  if (!isRecord(raw) || raw['version'] !== TREE_FILTER_VERSION) return defaultTreeFilter();
  const conditions = Array.isArray(raw['conditions'])
    ? raw['conditions']
        .map(normalizeCondition)
        .filter((condition): condition is TreeFilterCondition => condition !== null)
        .slice(0, TREE_FILTER_LIMITS.maxConditions)
    : [];

  return {
    version: TREE_FILTER_VERSION,
    enabled: typeof raw['enabled'] === 'boolean' ? raw['enabled'] : true,
    conditions,
    hideEmpty: typeof raw['hideEmpty'] === 'boolean' ? raw['hideEmpty'] : true,
  };
}

export function normalizeCondition(raw: unknown): TreeFilterCondition | null {
  if (!isRecord(raw) || typeof raw['type'] !== 'string' || !raw['type'].trim()) return null;
  const test = normalizeTest(raw['test']);

  return test ? { type: raw['type'].trim(), test } : null;
}

function normalizeTest(raw: unknown): TreeFilterTest | null {
  if (!isRecord(raw)) return null;

  switch (raw['kind']) {
    case 'alarms':
      return (ALARM_SEVERITIES as readonly unknown[]).includes(raw['atLeast'])
        ? { kind: 'alarms', atLeast: raw['atLeast'] as AlarmSeverityKey }
        : null;
    case 'unavailable':
      return { kind: 'unavailable' };

    case 'property': {
      const { path, op, value } = raw;

      if (typeof path !== 'string' || !PATH_PATTERN.test(path)) return null;
      if (!(PROPERTY_OPERATORS as readonly unknown[]).includes(op)) return null;
      if (op === 'exists') return { kind: 'property', path, op };
      if (typeof value !== 'string' || value.length > TREE_FILTER_LIMITS.maxValue) return null;

      return { kind: 'property', path, op: op as PropertyOperator, value };
    }
    default:
      return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
