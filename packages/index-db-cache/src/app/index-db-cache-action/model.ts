/** One bucket entry returned by the series API when aggregationFunction is requested. */
export interface AggregatedSeriesEntry {
  min: number;
  max: number;
  /** Present when aggregationFunction includes AVG (time series persistence only). */
  avg?: number;
  /** Present when aggregationFunction includes SUM. */
  sum?: number;
  /** Present when aggregationFunction includes COUNT. */
  count?: number;
  /** Present when aggregationFunction includes STDDEV_POP. */
  stdDevPop?: number;
  /** Present when aggregationFunction includes STDDEV_SAMP. */
  stdDevSamp?: number;
}

/** Shape of the getMeasurementSeriesResource response when aggregation functions are used. */
export interface AggregatedISeries {
  values: { [timestamp: string]: AggregatedSeriesEntry[] };
  truncated?: boolean;
}
