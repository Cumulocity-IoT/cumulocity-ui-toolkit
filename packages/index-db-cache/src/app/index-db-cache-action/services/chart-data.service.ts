// ─── Shared data shapes for Cumulocity measurement / series APIs ──────────────

/**
 * A single aggregated data point returned inside a series-API bucket.
 * All stat fields are optional because the exact functions returned depend on
 * the `aggregationFunction` query params sent with the request.
 */
export interface SeriesDataPoint {
  min?: number;
  max?: number;
  avg?: number;
  sum?: number;
  count?: number;
  stdDevPop?: number;
  stdDevSamp?: number;
}

/**
 * Shape of the `/measurement/measurements/series` response body
 * (identical for both the new `aggregationInterval` and legacy `aggregationType` variants).
 *
 * `values` keys are ISO 8601 timestamps. Each value is an ordered array of
 * {@link SeriesDataPoint} objects — one entry per `series` requested.
 */
export interface SeriesResponse {
  values: Record<string, SeriesDataPoint[]>;
  series: { unit: string; name: string; type: string }[];
  truncated: boolean;
}

/**
 * Internal shape used by {@link NewSeriesCacheService} and
 * {@link OldSeriesCacheService} when dealing with a single series.
 * `values` maps ISO 8601 timestamps to a one-element array of
 * {@link SeriesDataPoint} for that series.
 */
export interface AggregatedISeries {
  values: Record<string, SeriesDataPoint[]>;
}

// ─── Raw measurement API types ─────────────────────────────────────────────────

/** A single series value inside a raw measurement fragment. */
export interface MeasurementValueEntry {
  value: number;
  unit?: string;
}

/**
 * Simplified representation of a Cumulocity measurement object.
 * Fragment properties (e.g. `c8y_TemperatureMeasurement`) are typed as
 * `unknown` because their structure varies per measurement type.
 */
export interface CumulocityMeasurement {
  id: string;
  self?: string;
  source: { id: string; self?: string };
  /** ISO 8601 timestamp reported by the device. */
  time: string;
  type: string;
  [fragment: string]: unknown;
}

/** Shape of a `/measurement/measurements` collection response. */
export interface MeasurementCollection {
  measurements: CumulocityMeasurement[];
  statistics?: { totalPages?: number; pageSize: number; currentPage: number };
  next?: string;
  prev?: string;
  self?: string;
}
