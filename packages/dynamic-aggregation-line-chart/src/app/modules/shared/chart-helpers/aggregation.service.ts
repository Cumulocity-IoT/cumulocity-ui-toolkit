import { Injectable } from '@angular/core';

export interface AggregationCandidate {
  /** Cumulocity aggregationInterval string, e.g. `"300s"`, `"2d"`, `"1M"`. */
  value: string;
  /**
   * Approximate duration in seconds used only for threshold comparison.
   * Calendar units (M, q, y) use fixed approximations: 30 d/month, 365 d/year.
   */
  seconds: number;
}

/**
 * Unit definitions that drive candidate generation.
 *
 * Rules from the Cumulocity API spec:
 *  - Units: s · m · h · d · w · M · q · y
 *  - Multiplier: positive integer 1–999, no leading zeros
 *  - Format: `{multiplier}{unit}`, total length 2–4 characters
 *
 * Month/quarter/year values that would produce identical seconds
 * (e.g. 3M = 1q = 7 776 000 s) are omitted on the smaller-unit side
 * to avoid duplicates in the sorted list.
 */
const UNIT_DEFS: ReadonlyArray<{
  unit: string;
  secondsPerUnit: number;
  multipliers: readonly number[];
}> = [
  { unit: 's', secondsPerUnit: 1,           multipliers: [2, 5, 10, 20, 30, 40, 50] },
  { unit: 'm', secondsPerUnit: 60,          multipliers: [1, 2, 5, 10, 15, 20, 25, 30, 45] },
  { unit: 'h', secondsPerUnit: 3_600,       multipliers: [1, 2, 3, 4, 6, 8, 12] },
  { unit: 'd', secondsPerUnit: 86_400,      multipliers: [1, 2, 3, 4, 5, 6] },
  { unit: 'w', secondsPerUnit: 604_800,     multipliers: [1, 2, 3] },
  { unit: 'M', secondsPerUnit: 2_592_000,   multipliers: [1, 2] },
  { unit: 'q', secondsPerUnit: 7_776_000,   multipliers: [1, 2, 3, 4] },
  { unit: 'y', secondsPerUnit: 31_536_000,  multipliers: [1, 2, 3, 5] },
];

/**
 * Pre-built, strictly ascending list of all supported Cumulocity
 * `aggregationInterval` candidates derived from {@link UNIT_DEFS}.
 * Exported for use in unit tests.
 */
export const AGGREGATION_CANDIDATES: readonly AggregationCandidate[] = UNIT_DEFS
  .flatMap(({ unit, secondsPerUnit, multipliers }) =>
    multipliers.map(n => ({ value: `${n}${unit}`, seconds: n * secondsPerUnit })),
  )
  .sort((a, b) => a.seconds - b.seconds);

@Injectable()
export class AggregationService {
  /**
   * Returns the smallest Cumulocity `aggregationInterval` value that keeps the
   * number of data points at or below `maxPoints` (default 5 000).
   *
   * Formula: `minIntervalSeconds = rangeSeconds / maxPoints`.
   * The first candidate whose duration ≥ that threshold is returned.
   * Falls back to `'5y'` if the range is so large no candidate fits.
   */
  computeAggregationInterval(dateFrom: Date, dateTo: Date, maxPoints = 5_000): string {
    const rangeSeconds = (dateTo.getTime() - dateFrom.getTime()) / 1_000;
    const minIntervalSeconds = rangeSeconds / maxPoints;
    return AGGREGATION_CANDIDATES.find(({ seconds }) => seconds >= minIntervalSeconds)?.value ?? '5y';
  }
}
