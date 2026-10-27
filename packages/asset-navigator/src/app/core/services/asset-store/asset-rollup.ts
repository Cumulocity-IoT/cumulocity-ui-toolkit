import {
  ALARM_SEVERITIES,
  EMPTY_ALARM_COUNTS,
  NO_PENDING_CHILDREN,
  type AlarmCounts,
  type AlarmSeverityKey,
  type AssetAvailability,
  type AttachedDevice,
  type AssetHierarchy,
  type AssetNode,
  type AssetRollup,
  type AssetStoreMode,
} from './asset-store.model';

/**
 * Pure hierarchy maths: MO → node projection, the bottom-up rollup, and path/order
 * helpers. Deliberately free of Angular and of the SDK so it can be unit-tested the
 * moment a frontend test runner exists (prefer Vitest, as the backend does).
 */

/**
 * Sibling order. Numeric collation so `T2` sorts before `T10` and `069` before `114` —
 * asset and device names are very often numbered, and plain lexical order reads as shuffled.
 *
 * The sweep cannot do this for us: it is ordered by `_id` (the only ordering that makes
 * paging stable), and sibling order comes from each parent's `childAssets` references,
 * which the platform returns in an arbitrary order regardless of `$orderby`.
 */
const BY_NAME = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** Fragments the tree/detail panel never reads, and that would bloat every node. */
const OMITTED_FRAGMENTS = new Set([
  'id',
  'name',
  'type',
  'self',
  'childAssets',
  'childDevices',
  'childAdditions',
  'deviceParents',
  'assetParents',
  'additionParents',
  'c8y_ActiveAlarmsStatus',
  'c8y_Position',
  // `c8y_Notes` (the asset description) is deliberately **not** omitted: the search
  // indexes it, and "the site where the pump was replaced" is a real query. It is one
  // short string per asset next to fragments already kept in full.
]);

/** Minimal shape this module needs — narrower than `IManagedObject` on purpose. */
export interface RawManagedObject {
  id: string | number;
  name?: string;
  type?: string;
  childAssets?: {
    references?: { managedObject?: { id?: string | number } }[];
    /**
     * Total children, present only when the request asked for `withChildrenCount=true`.
     *
     * This is what makes lazy loading possible: `withChildren` **defaults to `false`** on
     * current platforms (feature toggle `core.inventory.without.children`), so a child in a
     * `childAssets` response carries no references of its own and "does this have children?"
     * cannot be answered from the reference list. The count can.
     */
    count?: number;
  };
  [key: string]: unknown;
}

/**
 * Availability from the platform-standard `c8y_Availability.status` (written by the platform's
 * availability monitoring). `MAINTENANCE` reads as `unavailable` — deliberately out of service;
 * anything missing or unmapped is `unknown`, which is never counted as a fault.
 */
export function readAvailability(mo: RawManagedObject): AssetAvailability {
  const fragment = mo['c8y_Availability'];

  if (!fragment || typeof fragment !== 'object') return 'unknown';
  const status = (fragment as Record<string, unknown>)['status'];

  switch (typeof status === 'string' ? status.toUpperCase() : null) {
    case 'AVAILABLE':
      return 'available';
    case 'UNAVAILABLE':
    case 'MAINTENANCE':
      return 'unavailable';
    default:
      return 'unknown';
  }
}

/** A plain device — `c8y_IsDevice` without `c8y_IsAsset`: counted below its asset, never a row. */
export function isPlainDevice(mo: RawManagedObject): boolean {
  return mo['c8y_IsDevice'] !== undefined && mo['c8y_IsAsset'] === undefined;
}

function toAttachedDevice(mo: RawManagedObject): AttachedDevice {
  const id = String(mo.id);

  return {
    id,
    name: mo.name ?? id,
    type: mo.type ?? '',
    availability: readAvailability(mo),
    alarms: readAlarmCounts(mo),
  };
}

export function readAlarmCounts(mo: RawManagedObject): AlarmCounts {
  const raw = mo['c8y_ActiveAlarmsStatus'];

  if (!raw || typeof raw !== 'object') return EMPTY_ALARM_COUNTS;
  const source = raw as Record<string, unknown>;
  let anyPresent = false;
  const counts = { ...EMPTY_ALARM_COUNTS };

  for (const severity of ALARM_SEVERITIES) {
    const value = source[severity];

    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      counts[severity] = value;
      anyPresent = true;
    }
  }

  // Share the frozen empty object when there is nothing to report, so identity
  // comparison in `sameNode` stays cheap for the overwhelmingly common case.
  return anyPresent ? counts : EMPTY_ALARM_COUNTS;
}

export function readPosition(mo: RawManagedObject): { lat: number; lng: number } | undefined {
  const raw = mo['c8y_Position'];

  if (!raw || typeof raw !== 'object') return undefined;
  const { lat, lng } = raw as { lat?: unknown; lng?: unknown };
  return typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : undefined;
}

/**
 * Everything else on the MO, so the detail panel can render tier-0 fields at once.
 * `c8y_Availability` deliberately stays: `availability` reduces it to one word, and a
 * configured `property` field may still want the raw fragment (e.g. `lastMessage`).
 */
function readProperties(mo: RawManagedObject): Record<string, unknown> {
  const properties: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(mo)) {
    if (OMITTED_FRAGMENTS.has(key)) continue;
    if (typeof value === 'function') continue;
    properties[key] = value;
  }

  return properties;
}

/** One MO → one node, minus the edges (`parentId`/`depth` are linked afterwards). */
export function toAssetNode(mo: RawManagedObject): AssetNode {
  const id = String(mo.id);
  return {
    id,
    name: mo.name ?? id,
    type: mo.type ?? '',
    parentId: null,
    depth: 0,
    childIds: (mo.childAssets?.references ?? [])
      .map((reference) => reference.managedObject?.id)
      .filter((childId): childId is string | number => childId !== undefined && childId !== null)
      .map(String),
    position: readPosition(mo),
    alarms: readAlarmCounts(mo),
    availability: readAvailability(mo),
    isDevice: mo['c8y_IsDevice'] !== undefined,
    devices: [],
    properties: readProperties(mo),
  };
}

/**
 * Whether a freshly projected node is indistinguishable from the cached one. Every poll
 * re-reads the whole fleet, but almost nothing changes; reusing the previous object keeps
 * `OnPush` rows from repainting (NFR-T1).
 *
 * `parentId`/`depth` are excluded on purpose — they are assigned by `linkHierarchy`
 * after this comparison, from the same edge data `childIds` already covers.
 */
function sameNode(previous: AssetNode, next: AssetNode): boolean {
  return (
    previous.name === next.name &&
    previous.type === next.type &&
    previous.availability === next.availability &&
    previous.isDevice === next.isDevice &&
    sameDevices(previous.devices, next.devices) &&
    previous.alarms.critical === next.alarms.critical &&
    previous.alarms.major === next.alarms.major &&
    previous.alarms.minor === next.alarms.minor &&
    previous.alarms.warning === next.alarms.warning &&
    previous.position?.lat === next.position?.lat &&
    previous.position?.lng === next.position?.lng &&
    previous.childIds.length === next.childIds.length &&
    previous.childIds.every((childId, index) => childId === next.childIds[index]) &&
    sameProperties(previous.properties, next.properties)
  );
}

function sameDevices(
  previous: readonly AttachedDevice[],
  next: readonly AttachedDevice[]
): boolean {
  return (
    previous.length === next.length &&
    previous.every((device, index) => {
      const other = next[index];

      return (
        device.id === other.id &&
        device.name === other.name &&
        device.availability === other.availability &&
        device.alarms.critical === other.alarms.critical &&
        device.alarms.major === other.alarms.major &&
        device.alarms.minor === other.alarms.minor &&
        device.alarms.warning === other.alarms.warning
      );
    })
  );
}

/**
 * `properties` is the whole MO minus `OMITTED_FRAGMENTS`, so it can be multi-KB per
 * asset — serialising it to compare would mean megabytes of throwaway strings per poll
 * across a fleet. The platform stamps `lastUpdated` on every change to a managed
 * object, so when both sides carry it that single field settles the question.
 *
 * Without it (a tenant or mock that omits it) fall back to a shallow own-key compare:
 * that can miss a change nested inside a fragment, which costs a stale detail-panel
 * field until the next real change — never a stale row, since everything the row draws
 * is compared explicitly above.
 */
function sameProperties(
  previous: Readonly<Record<string, unknown>>,
  next: Readonly<Record<string, unknown>>
): boolean {
  if (previous['lastUpdated'] && next['lastUpdated']) {
    return previous['lastUpdated'] === next['lastUpdated'];
  }
  const keys = Object.keys(previous);

  if (keys.length !== Object.keys(next).length) return false;

  return keys.every((key) => Object.is(previous[key], next[key]));
}

export interface BuildHierarchyOptions {
  /**
   * Build a partial hierarchy: unresolved child references mean "not loaded yet" rather than
   * "not permitted", so they grow twisties, and rollups stop claiming subtree totals they
   * cannot know. See {@link AssetStoreMode}.
   */
  highVolume?: boolean;
}

/**
 * Builds the hierarchy from a flat sweep.
 *
 * The sweep holds assets **and** devices. Assets become nodes; plain devices (see
 * {@link isPlainDevice}) are attached to the asset that references them and only feed the
 * rollup's device counts, availability and alarms — the tree draws assets.
 *
 * Parent edges are **inverted from `childAssets`** rather than fetched with
 * `withParents=true`: the sweep already carries every node, so the edges are free,
 * and `assetParents` is documented to ignore inventory roles — using it would let
 * an ancestor the user cannot see influence the shape (NFR-T4).
 *
 * `previous` is the last hierarchy, used only to preserve object identity for
 * unchanged nodes.
 */
export function buildHierarchy(
  raw: readonly RawManagedObject[],
  asOf: string,
  previous?: AssetHierarchy | null,
  options: BuildHierarchyOptions = {}
): AssetHierarchy {
  const mode: AssetStoreMode = options.highVolume ? 'high-volume' : 'full';
  const byId = new Map<string, AssetNode>();
  const childCounts = new Map<string, number>();

  const devices = new Map<string, AttachedDevice>();

  for (const mo of raw) {
    if (isPlainDevice(mo)) {
      devices.set(String(mo.id), toAttachedDevice(mo));
      continue;
    }
    const node = toAssetNode(mo);

    byId.set(node.id, node);
    const count = mo.childAssets?.count;

    if (typeof count === 'number' && Number.isFinite(count)) childCounts.set(node.id, count);
  }

  // Child edges may point at assets outside the sweep (no read permission, or a type we
  // do not carry). Drop those — a row we cannot render must not be counted — and put the
  // survivors in the order they are drawn in, so the row order is ours and not the
  // platform's reference order.
  const unresolved = new Set<string>();

  for (const node of byId.values()) {
    const reachable = node.childIds
      .filter((childId) => byId.has(childId))
      .sort((a, b) => BY_NAME.compare(byId.get(a)?.name ?? '', byId.get(b)?.name ?? ''));

    const attached = node.childIds
      .map((childId) => devices.get(childId))
      .filter((device): device is AttachedDevice => device !== undefined)
      .sort((a, b) => BY_NAME.compare(a.name, b.name));

    if (reachable.length + attached.length !== node.childIds.length) unresolved.add(node.id);

    if (
      attached.length ||
      reachable.length !== node.childIds.length ||
      reachable.some((childId, index) => childId !== node.childIds[index])
    ) {
      byId.set(node.id, { ...node, childIds: reachable, devices: attached });
    }
  }

  // In `full` mode an unresolved reference means "you may not see that asset" and must stay
  // invisible. In `high-volume` mode it means "not fetched yet" and has to grow a twisty —
  // preferring the platform's own child count, which is the only signal that survives
  // `withChildren` defaulting to false.
  const pendingChildren = options.highVolume
    ? new Set(
        [...byId.values()]
          .filter((node) => {
            const count = childCounts.get(node.id);

            // A count is authoritative: more children exist than are loaded ⇒ pending. It also
            // settles the leaf case (`count === 0` ⇒ never a twisty), which no reference list can.
            if (count !== undefined) return count > node.childIds.length + node.devices.length;

            // No count (an older platform, or a mock): fall back to the weaker signal.
            return unresolved.has(node.id);
          })
          .map((node) => node.id)
      )
    : NO_PENDING_CHILDREN;

  linkHierarchy(byId);

  const rootIds = [...byId.values()]
    .filter((node) => node.parentId === null)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((node) => node.id);

  // Identity preservation, after linking so `depth`/`parentId` are final.
  if (previous) {
    for (const [id, node] of byId) {
      const cached = previous.byId.get(id);

      if (
        cached &&
        cached.parentId === node.parentId &&
        cached.depth === node.depth &&
        sameNode(cached, node)
      ) {
        byId.set(id, cached);
      }
    }
  }

  return {
    byId,
    rootIds,
    rollup: computeRollup(byId, rootIds, previous?.rollup, pendingChildren),
    asOf,
    mode,
    pendingChildren,
  };
}

/**
 * Assigns `parentId` and `depth` by walking down from the roots. Cycles cannot
 * happen in a c8y asset hierarchy, but a `visited` guard is cheap and a cycle here
 * would hang the tree rather than misdraw it.
 */
function linkHierarchy(byId: Map<string, AssetNode>): void {
  const parentOf = new Map<string, string>();

  for (const node of byId.values()) {
    for (const childId of node.childIds) {
      // First parent wins; a c8y asset can be referenced by several groups, and the
      // tree needs exactly one place to draw each node.
      if (!parentOf.has(childId)) parentOf.set(childId, node.id);
    }
  }

  const visited = new Set<string>();
  const walk = (id: string, parentId: string | null, depth: number): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const node = byId.get(id);

    if (!node) return;

    if (node.parentId !== parentId || node.depth !== depth) {
      byId.set(id, { ...node, parentId, depth });
    }
    for (const childId of node.childIds) walk(childId, id, depth + 1);
  };

  for (const node of byId.values()) {
    if (!parentOf.has(node.id)) walk(node.id, null, 0);
  }

  // Anything left unvisited sits under a parent that is itself unreachable from a
  // root — draw it where its parent says, so it is never silently dropped.
  for (const node of byId.values()) {
    if (!visited.has(node.id)) walk(node.id, parentOf.get(node.id) ?? null, 0);
  }
}

function addCounts(into: AlarmCounts, from: AlarmCounts): void {
  into.critical += from.critical;
  into.major += from.major;
  into.minor += from.minor;
  into.warning += from.warning;
}

function worstOf(counts: AlarmCounts): AlarmSeverityKey | null {
  return ALARM_SEVERITIES.find((severity) => counts[severity] > 0) ?? null;
}

/** 1 when the severity is critical or major — what "alarmed" means in every count. */
function isSevere(severity: AlarmSeverityKey | null): number {
  return severity === 'critical' || severity === 'major' ? 1 : 0;
}

/**
 * Bottom-up rollup over the whole hierarchy, iterative (a 50k fleet would blow a
 * recursive stack). Every ancestor up to the root gets the subtree's worst severity,
 * so a critical alarm on one device reddens the whole path (AC-T10).
 */
export function computeRollup(
  byId: ReadonlyMap<string, AssetNode>,
  rootIds: readonly string[],
  previous?: ReadonlyMap<string, AssetRollup> | null,
  pendingChildren: ReadonlySet<string> = NO_PENDING_CHILDREN
): Map<string, AssetRollup> {
  // A **true post-order**: every node appears after all of its children, so the single pass
  // below can read each child's rollup as it goes.
  //
  // Not "pre-order, reversed", which is what this used to be. That only holds when the walk
  // enters each component at its top, and it does not: nodes unreachable from a root (see
  // `linkHierarchy`) are entered in `byId` order, i.e. the sweep's `_id` order, which says
  // nothing about depth. Entering such a component at a leaf put a parent ahead of its own
  // child, the child's rollup did not exist yet, and its alarms and counts were silently
  // dropped from every ancestor above it.
  //
  // Roots first so the reachable fleet is walked from the top, then whatever is left.
  const order: string[] = [];
  const seen = new Set<string>();
  const frames: { id: string; expanded: boolean }[] = [];

  for (const start of [...rootIds, ...byId.keys()]) {
    if (seen.has(start)) continue;
    frames.push({ id: start, expanded: false });

    while (frames.length) {
      const frame = frames[frames.length - 1];

      if (frame.expanded) {
        frames.pop();
        order.push(frame.id);
        continue;
      }
      frame.expanded = true;
      seen.add(frame.id);
      const node = byId.get(frame.id);

      if (!node) continue;

      for (const childId of node.childIds) {
        // A child already `seen` is either finished (its rollup will be there) or still on
        // the stack — a cycle's back edge, which cannot contribute to its own ancestor and
        // is left out rather than chased.
        if (!seen.has(childId)) frames.push({ id: childId, expanded: false });
      }
    }
  }

  // Subtrees that are missing data, propagated upwards: a node is incomplete when its own
  // children are unloaded, or when anything below it is incomplete. This is the whole reason
  // the rollup can stay honest in `high-volume` mode — a site with one loaded asset must not
  // report "worst: minor" while 499 unloaded siblings might be critical.
  const incomplete = new Set<string>(pendingChildren);
  const rollup = new Map<string, AssetRollup>();

  for (const id of order) {
    const node = byId.get(id);

    if (!node) continue;
    const alarms: AlarmCounts = { ...EMPTY_ALARM_COUNTS };

    addCounts(alarms, node.alarms);
    const ownWorst = worstOf(node.alarms);
    // Units, not alarms: a device with six active alarms is one alarmed device.
    let assetCount = 1;
    let alarmedAssetCount = isSevere(ownWorst);
    let deviceCount = node.isDevice ? 1 : 0;
    let alarmedDeviceCount = node.isDevice ? isSevere(ownWorst) : 0;
    let availableCount = node.isDevice && node.availability === 'available' ? 1 : 0;
    let unavailableCount = node.isDevice && node.availability === 'unavailable' ? 1 : 0;

    for (const device of node.devices) {
      addCounts(alarms, device.alarms);
      deviceCount++;
      alarmedDeviceCount += isSevere(worstOf(device.alarms));
      if (device.availability === 'available') availableCount++;
      if (device.availability === 'unavailable') unavailableCount++;
    }

    for (const childId of node.childIds) {
      const child = rollup.get(childId);

      // Post-order guarantees this is already computed, except for a cycle's back edge.
      if (!child) continue;
      if (incomplete.has(childId)) incomplete.add(node.id);
      addCounts(alarms, child.alarms);
      assetCount += child.assetCount;
      alarmedAssetCount += child.alarmedAssetCount;
      deviceCount += child.deviceCount;
      alarmedDeviceCount += child.alarmedDeviceCount;
      availableCount += child.availableCount;
      unavailableCount += child.unavailableCount;
    }

    const partial = incomplete.has(node.id);
    const next: AssetRollup = {
      // With an incomplete subtree the only severity we can stand behind is the node's own —
      // aggregating the loaded fraction would read as a fleet claim. The counts are kept (the
      // UI labels them as loaded-only and hides them where that would mislead) but `partial`
      // is what every consumer must branch on.
      worst: partial ? ownWorst : worstOf(alarms),
      alarms,
      assetCount,
      deviceCount,
      alarmedAssetCount,
      alarmedDeviceCount,
      availableCount,
      unavailableCount,
      ...(partial ? { partial: true as const } : {}),
    };
    // Identity preservation, for the same reason `buildHierarchy` does it for nodes:
    // the row objects carry `rollup`, so a fresh object for an unchanged subtree would
    // repaint every OnPush row in the viewport on every poll (NFR-T1).
    const cached = previous?.get(node.id);

    rollup.set(node.id, cached && sameRollup(cached, next) ? cached : next);
  }

  return rollup;
}

function sameRollup(a: AssetRollup, b: AssetRollup): boolean {
  return (
    a.worst === b.worst &&
    a.partial === b.partial &&
    a.assetCount === b.assetCount &&
    a.deviceCount === b.deviceCount &&
    a.alarmedAssetCount === b.alarmedAssetCount &&
    a.alarmedDeviceCount === b.alarmedDeviceCount &&
    a.availableCount === b.availableCount &&
    a.unavailableCount === b.unavailableCount &&
    ALARM_SEVERITIES.every((severity) => a.alarms[severity] === b.alarms[severity])
  );
}

/** Root → node, inclusive. Empty when the id is not in the hierarchy. */
export function pathOf(hierarchy: AssetHierarchy | null, id: string): AssetNode[] {
  if (!hierarchy) return [];
  const path: AssetNode[] = [];
  let current = hierarchy.byId.get(id);
  const guard = new Set<string>();

  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    path.unshift(current);
    current = current.parentId ? hierarchy.byId.get(current.parentId) : undefined;
  }

  return path;
}
