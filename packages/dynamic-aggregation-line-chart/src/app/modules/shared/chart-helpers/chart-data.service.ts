import { Injectable } from '@angular/core';
import { FetchClient } from '@c8y/client';

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

@Injectable()
export class ChartDataService {
  constructor(private fetchClient: FetchClient) {}

  /**
   * Fetches measurement series from GET /measurement/series using FetchClient so
   * that `aggregationFunction` can be repeated for each function (min, max, avg).
   *
   * Cumulocity requires the parameter to be supplied once per function:
   *   aggregationFunction=min&aggregationFunction=max&aggregationFunction=avg
   * A single comma-separated value is NOT accepted.
   *
   * For legacy persistence only min and max are returned; avg will be absent.
   *
   * Handles server-side pagination (truncated=true) by advancing dateFrom to the
   * latest returned timestamp and merging results.
   */
  async fetchSeriesWithAggregation(
    source: string,
    dateFrom: Date,
    dateTo: Date,
    series: string,
    aggregationInterval: string,
    aggregationFunctions: string[],
    accumulated?: AggregatedISeries
  ): Promise<AggregatedISeries> {
    // URLSearchParams serialises repeated keys correctly:
    // params.append('aggregationFunction', 'min') three times →
    // aggregationFunction=min&aggregationFunction=max&aggregationFunction=avg
    const params = new URLSearchParams();

    params.set('source', source);
    params.set('dateFrom', dateFrom.toISOString());
    params.set('dateTo', dateTo.toISOString());
    // 'series' must be repeated per occurrence when querying multiple series
    params.append('series', series);
    params.set('aggregationInterval', aggregationInterval);

    for (const fn of aggregationFunctions) {
      params.append('aggregationFunction', fn);
    }

    const response = await this.fetchClient.fetch(
      `/measurement/measurements/series?${params.toString()}`
    );

    if (!response.ok) {
      throw new Error(
        `Measurement series request failed: ${response.status} ${response.statusText}`
      );
    }
    const body = (await response.json()) as AggregatedISeries;

    const merged: AggregatedISeries = accumulated ?? { values: {} };

    for (const [ts, entries] of Object.entries(body.values ?? {})) {
      merged.values[ts] = entries;
    }

    if (body.truncated) {
      const latestTs = Object.keys(body.values).reduce((a, b) => (a > b ? a : b));
      return this.fetchSeriesWithAggregation(
        source,
        new Date(latestTs),
        dateTo,
        series,
        aggregationInterval,
        aggregationFunctions,
        merged
      );
    }

    return merged;
  }
}
