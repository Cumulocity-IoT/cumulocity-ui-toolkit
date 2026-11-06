import type { IManagedObject } from '@c8y/client';
import { gettext } from '@c8y/ngx-components/gettext';
import type { AlarmCounts, AlarmSeverityKey } from '../asset-store/asset-store.model';

/**
 * The shapes and constants of the **global search** — the tenant-wide palette over
 * assets *and* devices, which is a different question from the fast-navigation tree
 * (`~services/asset-store`). The tree answers "where in the wind hierarchy is this",
 * over a cached, wind-typed fleet; this answers "find anything in the tenant", including
 * the controller/RTU/SCADA devices the tree deliberately excludes.
 *
 * Design: `docs/GlobalSearch/spec.md`. Ported from the `c8y-search` experiment, whose
 * measurements against a live tenant are preserved in the comments below — they are the
 * reason for every number in this file.
 */

/** A managed object flattened into everything a result row needs to render. */
export interface SearchResult {
  id: string;
  name: string;
  type: string;
  isDevice: boolean;
  isAsset: boolean;
  /** Ancestor names, outermost first, for the breadcrumb. */
  breadcrumb: string[];
  /**
   * Ancestor ids over every parent, so a scope chip ("in Husum") can filter locally the way
   * `isinhierarchyof` does on the platform. Empty where the source did not ask for parents
   * (passthrough rows, which the platform has already scoped).
   */
  ancestorIds?: readonly string[];
  /**
   * Extra searchable text: hardware model, serial number, external ids.
   *
   * Real inventory data is full of these, and people search by them — on a live tenant
   * the devices were named `001-Main-Controller` but carried the model `Bachmann MC210`
   * and the serial `E101-SN-01`. Matching on the name alone would miss anyone who
   * searched by the sticker on the box.
   */
  keywords: string;
  /** Character ranges in `name` that matched, as [start, end) pairs. */
  highlights: ReadonlyArray<readonly [number, number]>;
  /** Active alarm counts by severity, when the object has any. */
  alarms?: AlarmCounts;
}

/**
 * One severity rendered as a badge, in the order a reader should scan them.
 *
 * The severity vocabulary is `~services/asset-store`'s, not a second copy: `AlarmCounts` is
 * already `Record<AlarmSeverityKey, number>` over the same four `c8y_ActiveAlarmsStatus` keys,
 * and two definitions of "the severities" would drift.
 */
export interface AlarmBadge {
  severity: AlarmSeverityKey;
  count: number;
  icon: string;
  label: string;
}

const BADGE_ORDER = [
  { severity: 'critical', icon: 'exclamation-circle', label: gettext('critical') },
  { severity: 'major', icon: 'warning', label: gettext('major') },
  { severity: 'minor', icon: 'error-warning', label: gettext('minor') },
  { severity: 'warning', icon: 'circle-info', label: gettext('warning') },
] as const;

/** Non-zero severities only, most severe first. */
export function toAlarmBadges(alarms: AlarmCounts | undefined): AlarmBadge[] {
  if (!alarms) return [];

  return BADGE_ORDER.filter((entry) => alarms[entry.severity] > 0).map((entry) => ({
    severity: entry.severity,
    count: alarms[entry.severity],
    icon: entry.icon,
    label: entry.label,
  }));
}

export function toAlarmCounts(managedObject: IManagedObject): AlarmCounts | undefined {
  const raw = managedObject['c8y_ActiveAlarmsStatus'] as Record<string, unknown> | undefined;

  if (!raw) return undefined;

  const count = (key: string): number => (typeof raw[key] === 'number' ? raw[key] : 0);
  const alarms: AlarmCounts = {
    critical: count('critical'),
    major: count('major'),
    minor: count('minor'),
    warning: count('warning'),
  };
  // The platform leaves the fragment behind with all-zero counts once alarms clear, which
  // should read as "no alarms" rather than as an empty badge row.
  return alarms.critical + alarms.major + alarms.minor + alarms.warning > 0 ? alarms : undefined;
}

/** One selectable asset-type chip. */
export interface TypeFacet {
  /** The identifier instances carry in their own `type` field. */
  type: string;
  label: string;
  /** Number of current results of this type, when known. */
  count?: number;
  /** Cumulocity icon name from the definition catalog. */
  icon?: string;
  selected: boolean;
}

/**
 * Which candidate source answered, so the UI can be honest about limits.
 *
 * `indexed` is reserved for a future microservice and is **not implemented** — it stays in
 * the union so adding it later is additive rather than a breaking change to every consumer.
 * See `docs/GlobalSearch/spec.md` §"Step 2".
 */
export type SearchMode = 'passthrough' | 'indexed' | 'prefetched';

export interface SearchStatus {
  mode: SearchMode;
  indexState: 'building' | 'ready' | 'stale' | 'absent';
  /** Present while an index is still being built. */
  progress?: number;
}

export interface SearchResponse {
  results: SearchResult[];
  status: SearchStatus;
  /** True when the platform had more matches than were fetched. */
  truncated: boolean;
}

export const SEARCH_LABEL = gettext('Search');
export const SEARCH_PLACEHOLDER = gettext('Search assets and devices');

/** Debounce for the search input. Long enough to avoid a request per keypress. */
export const SEARCH_DEBOUNCE_MS = 250;

/**
 * The page size the corpus is fetched with — the platform's own maximum.
 *
 * Not the mode boundary; that is {@link PREFETCH_THRESHOLD}. The two were one constant, which
 * read as a single decision but is really two: how much fits in one request (a property of the
 * platform) and how much is worth holding (a judgement).
 */
export const PREFETCH_LIMIT = 2000;

/**
 * The most objects a tenant can have and still be searched entirely in the browser. At or below
 * it the mode is `prefetched`; above it, `passthrough`.
 *
 * Equal to {@link PREFETCH_LIMIT}, because the platform's own maximum page size is what makes this
 * a boundary rather than a tuned guess: at or below it the whole corpus is a single request, so an
 * incremental strategy buys nothing.
 *
 * It stays a *separate* constant even while the two values agree, because they answer different
 * questions — how much fits in one request (a property of the platform) versus how much is worth
 * holding (a judgement). That separation is what lets this be lowered to exercise the
 * `passthrough` path without also shrinking the fetch; `25` is the value to use for that, and it
 * belongs in a branch rather than on `main`.
 *
 * Deliberately not a tenant option — the constraint is a property of the platform, not of a
 * deployment (see `docs/GlobalSearch/spec.md` §2).
 */
export const PREFETCH_THRESHOLD = PREFETCH_LIMIT;

/**
 * How many managed objects a passthrough search fetches.
 *
 * Measured on a 714k-device tenant: a page of 2000 took 6.3 s, 200 took 9.9 s with
 * ancestors, and 500 with ancestors timed out past 15 s. Fetching a large pool only helps
 * if the ranker can find something the server missed, and on this path it cannot — the
 * server has already decided what matches, so the extra rows are pure latency.
 */
export const CANDIDATE_PAGE_SIZE = 50;

/** Pages listed at once. Enough to reach any menu entry without burying results. */
export const PAGE_RESULT_LIMIT = 8;

/** Results rendered at once. Ranking still happens over the full candidate set. */
export const VISIBLE_RESULT_LIMIT = 50;

/**
 * The wire shape of an inventory collection. `IResultList` describes what the
 * `@c8y/client` *services* return after unwrapping; a raw `FetchClient` call sees this.
 */
export interface InventoryCollectionResponse {
  managedObjects?: IManagedObject[];
  statistics?: {
    currentPage?: number;
    pageSize?: number;
    totalElements?: number;
    totalPages?: number;
  };
}

function nameOf(managedObject: IManagedObject): string {
  const name: unknown = managedObject['name'];
  return typeof name === 'string' ? name : String(managedObject.id);
}

/**
 * Every ancestor id `withParents` returned — asset and device parents alike, since a controller
 * hangs below its turbine as a child *device*.
 */
function ancestorIdsOf(managedObject: IManagedObject): string[] {
  const parents = managedObject as IManagedObject & {
    deviceParents?: { references?: Array<{ managedObject?: { id?: string | number } }> };
  };
  const references = [
    ...(managedObject.assetParents?.references ?? []),
    ...(parents.deviceParents?.references ?? []),
  ];
  return references
    .map((reference) => reference.managedObject?.id)
    .filter((id) => id !== undefined && id !== null)
    .map(String);
}

/**
 * Builds the breadcrumb from `withParents`. The platform returns ancestors innermost
 * first, so the list is reversed for display.
 */
function breadcrumbOf(managedObject: IManagedObject): string[] {
  const references = managedObject.assetParents?.references ?? [];
  return references
    .map((reference) => reference.managedObject?.name)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
    .reverse();
}

/** Pulls the identifying strings people actually search by off a managed object. */
export function keywordsOf(managedObject: IManagedObject): string {
  const hardware = managedObject['c8y_Hardware'] as Record<string, unknown> | undefined;
  const candidates = [
    managedObject['serialNumber'],
    hardware?.['model'],
    hardware?.['serialNumber'],
    hardware?.['supplier'],
    managedObject['c8y_ExternalId'],
  ];

  return candidates
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');
}

export function toSearchResult(managedObject: IManagedObject): SearchResult {
  const alarms = toAlarmCounts(managedObject);
  return {
    id: String(managedObject.id),
    name: nameOf(managedObject),
    type: typeof managedObject['type'] === 'string' ? managedObject['type'] : '',
    isDevice: 'c8y_IsDevice' in managedObject,
    isAsset: 'c8y_IsAsset' in managedObject,
    breadcrumb: breadcrumbOf(managedObject),
    ancestorIds: ancestorIdsOf(managedObject),
    keywords: keywordsOf(managedObject),
    highlights: [],
    ...(alarms ? { alarms } : {}),
  };
}
