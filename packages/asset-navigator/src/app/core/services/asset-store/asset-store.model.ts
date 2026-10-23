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
 * How available a turbine is right now, derived from `wnd_Status` (see the
 * `ps-data-model` skill for the code tables):
 *
 * - `available`   — `WTUR.TurSt` is Starting / Running / Freerun and not curtailed
 * - `derated`     — running but `WTUR.OpMod` says curtailed / noise / shadow / sector
 * - `unavailable` — Stop / Standby / Braking, or `WTUR.OpMod` maintenance
 * - `unknown`     — no `wnd_Status`, or a code we do not map (never counted as a fault)
 */
export type AssetAvailability = 'available' | 'derated' | 'unavailable' | 'unknown';

/** One asset in the cached hierarchy. Plain data — no SDK models, no class instances. */
export interface AssetNode {
  id: string;
  name: string;
  /** The discriminating managed-object `type`, e.g. `wind_park`, `wind_turbine`. */
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
  /** This asset's own availability. Only meaningful for turbines. */
  availability: AssetAvailability;
  /**
   * The tier-0 fragments the detail panel can show without a request — the raw MO
   * minus the parts already projected above and minus the heavy fragments
   * (`childAssets`, `childDevices`, `wnd_PowerCurve`, …). Read by path.
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
   * Subtree alarm totals, including the node's own. **Alarms, not assets** — one turbine
   * with six active alarms contributes six.
   */
  alarms: AlarmCounts;
  /**
   * Turbines in the subtree carrying at least one critical or major alarm. The count of
   * *assets*, which is what a fleet summary means by "how many are alarmed" — reporting
   * {@link alarms} there claimed 114 alarmed turbines out of a 114-turbine fleet.
   */
  alarmedCount: number;
  /** `wind_turbine` descendants (plus the node itself when it is one). */
  turbineCount: number;
  /** Turbines in the subtree that are `unavailable`. This is the dot's shape. */
  unavailableCount: number;
  /** Turbines in the subtree that are `derated`. */
  deratedCount: number;
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
 * The external identity that marks **the** fleet root group, resolved through the Identity API
 * (`GET /identity/externalIds/{type}/{externalId}`). Shared with the backend's `GET /api/assets`
 * (`apps/backend/backwind/server/routes/api/assets.get.ts`) — keep the two in step.
 *
 * A tenant can hold several parentless device groups (imports, test data, other solutions'
 * roots), so "the first `onlyRoots` hit" is not a stable answer to "where is the fleet"; an
 * external id is (#382).
 */
export const FLEET_ROOT_EXTERNAL_ID_TYPE = 'c8y_Asset';
export const FLEET_ROOT_EXTERNAL_ID = 'wind-fleet';

/** Tuning for the sweep. All optional — the defaults describe the windy-dev fleet. */
export interface AssetStoreConfig {
  /**
   * Root asset to scope the sweep to, via `isinhierarchyof(<id>)`. When unset the store
   * resolves the fleet root through the Identity API ({@link FLEET_ROOT_EXTERNAL_ID_TYPE} /
   * {@link FLEET_ROOT_EXTERNAL_ID}), then tries the root device group (`fragmentType` +
   * `onlyRoots`), and falls back to the type union below if there is none.
   */
  rootId?: string;
  /**
   * Types swept when there is no discoverable root. Also the vocabulary the tree
   * uses for icons and level filters, so keep it ordered top-down.
   */
  hierarchyTypes: readonly string[];
  /** The leaf type counts roll up (`n WTG` on branch rows). */
  leafType: string;
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
  hierarchyTypes: [
    'wind_fleet_root',
    'wind_service_region',
    'wind_service_area',
    'wind_park',
    'wind_turbine',
  ],
  leafType: 'wind_turbine',
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
  alarmedCount: 0,
  turbineCount: 0,
  unavailableCount: 0,
  deratedCount: 0,
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
 * the detail panel and the assistant can describe one turbine three ways.
 */
export function availabilityLabel(availability: AssetAvailability): string {
  switch (availability) {
    case 'available':
      return gettext('Running');
    case 'derated':
      return gettext('Derated');
    case 'unavailable':
      return gettext('Not producing');
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
 * `wind_service_region` → `Service region`. The type strings are the vocabulary; this is
 * the display form, used by the overlay's level tabs and indexed by the search so typing
 * "park" finds parks.
 */
export function assetTypeLabel(type: string): string {
  return type
    .replace(/^wind_/, '')
    .replace(/_/g, ' ')
    .replace(/^./, (first) => first.toUpperCase());
}

/** c8y icon name per hierarchy level. Falls back to a neutral dot in the row. */
export const ASSET_TYPE_ICONS: Readonly<Record<string, string>> = Object.freeze({
  wind_fleet_root: 'sitemap',
  wind_service_region: 'globe',
  wind_service_area: 'map-marker-multiple',
  wind_park: 'c8y-group',
  wind_turbine: 'c8y-device',
  wind_weather_station: 'thermometer',
  wind_substation: 'flash',
  wind_park_rtu: 'router',
  wind_pcc_meter: 'gauge',
});
