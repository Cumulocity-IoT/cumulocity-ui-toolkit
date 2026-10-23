/**
 * The declarative metric vocabulary from `docs/FastNavigation/host-component-design.md`
 * §4.1. One `MetricSpec` list drives every renderer: grid columns, filter forms, map
 * popup bindings — and the tree's hover detail panel (tree design §6.3, NFR-T6).
 *
 * It lives in `shared`, not in a plugin, precisely so a field declared for one
 * renderer is available to the others for free. Adding a field means adding a spec,
 * never touching a component.
 */

export type MetricSpec =
  /** A path into the managed object — free, already in the asset store. */
  | { key: string; kind: 'mo'; path: string }
  /**
   * A measurement series, `<fragment>.<series>` (e.g. `WTUR.W`).
   *
   * `fn: 'latest'` resolves from the platform's `c8y_LatestMeasurements` fragment
   * (`withLatestValues=true`) — one request, no aggregation service. Every other
   * `fn`/`window` combination needs aggregation-ms `POST /enrich`, which is not wired
   * yet; those fields render as unavailable rather than as a wrong number.
   */
  | {
      key: string;
      kind: 'measurement';
      series: string;
      fn: 'latest' | 'avg' | 'min' | 'max' | 'sum' | 'delta';
      window?: string;
      unit?: string;
    }
  /**
   * Active alarm counts. Severity-only aggregation resolves from tier 0
   * (`c8y_ActiveAlarmsStatus`) with **no** server call; an `alarmType` scope needs
   * the enrichment path.
   */
  | {
      key: string;
      kind: 'alarm';
      agg: 'count';
      severities?: ('CRITICAL' | 'MAJOR' | 'MINOR' | 'WARNING')[];
      alarmType?: string;
    };

/** A `MetricSpec` dressed for display in the detail panel. */
export interface DetailFieldSpec {
  spec: MetricSpec;
  /** User-visible label. `gettext()` it at the declaration site. */
  label: string;
  /** Rendering hint; `status` and `alarms` have their own presentation. */
  render?: 'number' | 'percent' | 'status' | 'alarms' | 'text' | 'date';
  /** Decimals for `number`/`percent`. */
  precision?: number;
  unit?: string;
}

/**
 * Whether a spec can be resolved today. `false` means "declared, but the data path
 * does not exist yet" — the panel shows the row as unavailable instead of blank, so a
 * missing backend reads as a gap rather than as a clean turbine (NFR-T5).
 */
export function isResolvable(spec: MetricSpec): boolean {
  if (spec.kind === 'mo') return true;
  if (spec.kind === 'alarm') return !spec.alarmType;

  return spec.fn === 'latest';
}

/** Dot-path read used by `mo`-kind specs. */
export function readPath(source: unknown, path: string): unknown {
  let current = source;

  for (const segment of path.split('.')) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}
