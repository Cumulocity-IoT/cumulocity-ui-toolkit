/**
 * Tier-0 asset model — everything that lives on the managed object itself and is
 * therefore free to have (`docs/FastNavigation/host-component-design.md` §3.1).
 *
 * "Tier 0" is a hard boundary: nothing in here may require a measurement, alarm or
 * aggregation call. The tree renders rolled-up state for a whole fleet off one
 * inventory sweep, and that is only true as long as this stays MO-resident.
 */
import { gettext } from '@c8y/ngx-components/gettext';

/** The four severities `c8y_ActiveAlarmsStatus` counts. Ordered worst-first. */
export const ALARM_SEVERITIES = ['critical', 'major', 'minor', 'warning'] as const;

export type AlarmSeverityKey = (typeof ALARM_SEVERITIES)[number];

/** Active + acknowledged alarm counts, as the platform reports them on the MO. */
export type AlarmCounts = Record<AlarmSeverityKey, number>;

/**
 * How available a device is right now, from the platform-standard `c8y_Availability.status`
 * fragment the availability monitoring writes onto every monitored device:
 *
 * - `available`   — `AVAILABLE`
 * - `unavailable` — `UNAVAILABLE`, and also `MAINTENANCE`: a device in a maintenance window is
 *   deliberately out of service, which for triage is the same as "not available" (no separate
 *   state, so the dot keeps two fills)
 * - `unknown`     — no `c8y_Availability`, or a status we do not map. Never counted as a fault:
 *   most devices are simply not availability-monitored.
 */
export type AssetAvailability = 'available' | 'unavailable' | 'unknown';

/**
 * A plain device (`c8y_IsDevice` without `c8y_IsAsset`) hanging below an asset. Not a tree row —
 * the tree draws assets — but it counts: its availability and alarms roll up into every ancestor.
 */
export interface AttachedDevice {
  id: string;
  name: string;
  type: string;
  availability: AssetAvailability;
  alarms: AlarmCounts;
  /**
   * Latest measurement values by series (`c8y_Temperature.T`), present when the sweep asked for
   * them (`withLatestValues`, only while a rollup needs them). Rolled up, never drawn.
   */
  latest?: Readonly<Record<string, number>>;
}

/** One asset in the cached hierarchy. Plain data — no SDK models, no class instances. */
export interface AssetNode {
  id: string;
  name: string;
  /** The discriminating managed-object `type`, e.g. `building`, `production_line`. */
  type: string;
  /** `null` for a root of the cached hierarchy (not necessarily a tenant root). */
  parentId: string | null;
  /** Child **asset** ids, in the order the platform returned them. */
  childIds: readonly string[];
  /** 0 for a root of the cached hierarchy. */
  depth: number;
  position?: { lat: number; lng: number };
  /** This asset's own active alarms. Subtree totals live on the rollup. */
  alarms: AlarmCounts;
  /**
   * This asset's own availability (`c8y_Availability`). Only meaningful when the asset is itself a
   * device ({@link isDevice}); otherwise `unknown` and the subtree's devices say it (rollup).
   */
  availability: AssetAvailability;
  /** The asset is also a device (`c8y_IsDevice`), e.g. a device modelled in the DTM. */
  isDevice: boolean;
  /** Plain devices referenced as this asset's children. Counted, not drawn. */
  devices: readonly AttachedDevice[];
  /**
   * The tier-0 fragments the detail panel can show without a request — the raw MO
   * minus the parts already projected above and minus the heavy fragments
   * (`childAssets`, `childDevices`, …). Read by path.
   */
  properties: Readonly<Record<string, unknown>>;
}

/** Subtree state, rolled up bottom-up over the cached hierarchy. */
export interface AssetRollup {
  /**
   * Worst active alarm severity anywhere in the subtree (including the node
   * itself), or `null` when the subtree is clean. This is the dot's colour.
   */
  worst: AlarmSeverityKey | null;
  /**
   * Subtree alarm totals, including the node's own and those of its attached devices. **Alarms,
   * not assets** — one device with six active alarms contributes six.
   */
  alarms: AlarmCounts;
  /** Assets in the subtree, **including the node itself** (so a leaf has 1). */
  assetCount: number;
  /**
   * Devices in the subtree: attached plain devices, plus every asset that is itself a device
   * (the node included).
   */
  deviceCount: number;
  /**
   * Assets in the subtree (node included) whose own alarms include a critical or major one. The
   * count of *assets*, which is what a summary means by "how many are alarmed".
   */
  alarmedAssetCount: number;
  /** Devices in the subtree whose own alarms include a critical or major one. */
  alarmedDeviceCount: number;
  /** Devices in the subtree reporting `c8y_Availability` `AVAILABLE`. */
  availableCount: number;
  /** Devices in the subtree that are `unavailable`. This is the dot's shape. */
  unavailableCount: number;
  /**
   * `true` when part of this subtree is **not loaded** (`high-volume` mode only), so every
   * count above is a floor rather than a total and {@link AssetRollup.worst} has been narrowed
   * to the node's *own* severity.
   *
   * Absent — not `false` — in the complete case, so `full`-mode rollups keep the exact object
   * shape they always had and the frozen {@link EMPTY_ROLLUP} stays usable.
   */
  partial?: true;
}

/**
 * How the store obtained what it holds.
 *
 * - `full` — one sweep holds the entire fleet. Every rollup, count and search result is
 *   complete, which is what the tree was originally designed around.
 * - `high-volume` — the fleet is too large to hold (see `HIGH_VOLUME_THRESHOLD`), so the
 *   hierarchy is the roots plus whichever branches have been loaded on demand. **Anything
 *   derived from it is a statement about the loaded set, not about the fleet**, which is why
 *   this mode travels on the hierarchy itself rather than sitting in a service field: every
 *   consumer that draws a total has to be able to see it.
 */
export type AssetStoreMode = 'full' | 'high-volume';

/** Loading state of one branch's children, in `high-volume` mode. */
export type BranchStatus = 'loading' | 'loaded' | 'partial' | 'error';

/** Shared empty set for `full` mode, so nothing allocates per rebuild. */
export const NO_PENDING_CHILDREN: ReadonlySet<string> = Object.freeze(new Set<string>());

/** The whole cached fleet: nodes, roots, rollup, and when it was read. */
export interface AssetHierarchy {
  byId: ReadonlyMap<string, AssetNode>;
  rootIds: readonly string[];
  rollup: ReadonlyMap<string, AssetRollup>;
  /** ISO timestamp of the sweep this hierarchy came from. */
  asOf: string;
  /** See {@link AssetStoreMode}. `full` for every hierarchy built from a whole-fleet sweep. */
  mode: AssetStoreMode;
  /**
   * Nodes known to have children that are **not loaded**, so a branch can render a twisty
   * before anyone has fetched what is behind it.
   *
   * Populated from `childAssets.count` (`withChildrenCount=true`), falling back to
   * "references that did not resolve" where no count is present. Empty
   * ({@link NO_PENDING_CHILDREN}) in `full` mode: there, an unresolvable reference means the
   * user cannot see that asset, which is not the same thing as "not loaded yet" and must
   * never grow a twisty.
   */
  pendingChildren: ReadonlySet<string>;
}

/**
 * The external identity that marks **the** root of the navigated hierarchy, resolved through the
 * Identity API (`GET /identity/externalIds/{type}/{externalId}`). Optional: give one asset this
 * external id to pin the tree to it; without it the store falls back to the first root group.
 *
 * A tenant can hold several parentless groups (imports, test data, other solutions' roots), so
 * "the first `onlyRoots` hit" is not a stable answer to "where does the tree start"; an external
 * id is.
 */
export const FLEET_ROOT_EXTERNAL_ID_TYPE = 'c8y_Asset';
export const FLEET_ROOT_EXTERNAL_ID = 'asset-navigator-root';

/** Tuning for the sweep. All optional. */
export interface AssetStoreConfig {
  /**
   * Root asset to scope the sweep to, via `isinhierarchyof(<id>)`. When unset the store
   * resolves the root through the Identity API ({@link FLEET_ROOT_EXTERNAL_ID_TYPE} /
   * {@link FLEET_ROOT_EXTERNAL_ID}), then tries the root group (`fragmentType` +
   * `onlyRoots`), and falls back to every asset and device of the tenant if there is none.
   */
  rootId?: string;
  /**
   * Poll interval while **nothing is displaying the tree** — the background cadence that
   * runs from plugin load onwards, so the first open is instant.
   */
  idleIntervalMs: number;
  /**
   * Poll interval while **a tree is on screen** (the drawer or the `⌘K` overlay). Rows
   * carry live alarm and availability state, so what the user is looking at has to move.
   */
  activeIntervalMs: number;
}

export const DEFAULT_ASSET_STORE_CONFIG: AssetStoreConfig = {
  idleIntervalMs: 300_000,
  activeIntervalMs: 30_000,
};

export const EMPTY_ALARM_COUNTS: AlarmCounts = Object.freeze({
  critical: 0,
  major: 0,
  minor: 0,
  warning: 0,
});

export const EMPTY_ROLLUP: AssetRollup = Object.freeze({
  worst: null,
  alarms: EMPTY_ALARM_COUNTS,
  assetCount: 0,
  deviceCount: 0,
  alarmedAssetCount: 0,
  alarmedDeviceCount: 0,
  availableCount: 0,
  unavailableCount: 0,
});

/** An empty hierarchy in the given mode — the shape a failed or not-yet-run load publishes. */
export function emptyHierarchy(asOf: string, mode: AssetStoreMode = 'full'): AssetHierarchy {
  return {
    byId: new Map(),
    rootIds: [],
    rollup: new Map(),
    asOf,
    mode,
    pendingChildren: NO_PENDING_CHILDREN,
  };
}

/**
 * The one place `AssetAvailability` becomes words. Lives next to the type it switches
 * on, because these strings are user-visible *and* AI-context-visible
 * (`docs/ContextAwareAIChat/ui-to-ai-context.spec.md`) — a second copy means the tree,
 * the detail panel and the assistant can describe one device three ways.
 */
export function availabilityLabel(availability: AssetAvailability): string {
  switch (availability) {
    case 'available':
      return gettext('Available');
    case 'unavailable':
      return gettext('Unavailable');
    default:
      return gettext('Unknown');
  }
}

/**
 * `"2 critical, 1 minor"` — worst-first, omitting zeroes, `null` when clean. Shared by
 * the row tooltip and the detail panel's alarm field so the two cannot disagree.
 */
export function alarmSummary(counts: AlarmCounts): string | null {
  const parts = ALARM_SEVERITIES.filter((severity) => counts[severity] > 0).map(
    (severity) => `${counts[severity]} ${severity}`
  );
  return parts.length ? parts.join(', ') : null;
}

/**
 * `production_line` → `Production line`. The type strings are the vocabulary; this is the
 * display form, used by the overlay's level tabs and indexed by the search so typing "line"
 * finds production lines.
 */
export function assetTypeLabel(type: string): string {
  return type.replace(/_/g, ' ').replace(/^./, (first) => first.toUpperCase());
}

/**
 * What the counts in the footer, the branch badges and the branch detail rows count: **assets**
 * when the Digital Twin Manager is available (the tenant models assets), **devices** otherwise
 * (`null` — DTM not answered yet — counts devices, so the label never flips the wrong way).
 */
export type CountUnit = 'assets' | 'devices';

export function countUnitFor(dtmAvailable: boolean | null | undefined): CountUnit {
  return dtmAvailable === true ? 'assets' : 'devices';
}

/** The subtree count in `unit`, the node itself included (see {@link AssetRollup}). */
export function unitCount(rollup: AssetRollup, unit: CountUnit): number {
  return unit === 'assets' ? rollup.assetCount : rollup.deviceCount;
}

/** Of {@link unitCount}, how many carry a critical or major alarm of their own. */
export function alarmedUnitCount(rollup: AssetRollup, unit: CountUnit): number {
  return unit === 'assets' ? rollup.alarmedAssetCount : rollup.alarmedDeviceCount;
}

/**
 * What a **branch** row's badge says: the descendants in `unit`. Assets exclude the branch itself
 * ("3 assets" below a site); devices include it only when the branch is itself a device.
 */
export function branchBadgeCount(rollup: AssetRollup, unit: CountUnit): number {
  return unit === 'assets' ? Math.max(0, rollup.assetCount - 1) : rollup.deviceCount;
}

/**
 * The availability an asset row or panel shows: its own when it is a monitored device, else the
 * one its devices report — any unavailable device makes it `unavailable`, otherwise any available
 * one `available`, otherwise `unknown`.
 */
export function effectiveAvailability(node: AssetNode, rollup: AssetRollup): AssetAvailability {
  if (node.availability !== 'unknown') return node.availability;
  if (rollup.unavailableCount > 0) return 'unavailable';
  if (rollup.availableCount > 0) return 'available';

  return 'unknown';
}
