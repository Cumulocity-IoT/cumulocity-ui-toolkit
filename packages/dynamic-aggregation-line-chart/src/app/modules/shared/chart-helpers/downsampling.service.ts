import { Injectable } from '@angular/core';
import { ISeries } from '@c8y/client';

export type DownSampledData = {
  min: number[][];
  avg: number[][];
  max: number[][];
};
export type DownSamplingAlgorithm = 'LargestTriangeThreeBuckets' | 'PeakSampling';

@Injectable()
export class DownsamplingService {
  downsampleData(
    data: ISeries,
    algorithm: DownSamplingAlgorithm,
    limit: number = 1440
  ): DownSampledData {
    const minArray: number[][] = [];
    const maxArray: number[][] = [];
    const avgArray: number[][] = [];

    for (const date of Object.keys(data.values)) {
      const timestamp = new Date(date).getTime();
      const { min, max } = data.values[date][0];

      minArray.push([timestamp, min]);
      maxArray.push([timestamp, max]);
      // Note: the Cumulocity series API only returns min and max per bucket, not a true
      // mean. (min + max) / 2 is the best approximation available from this data source.
      avgArray.push([timestamp, (min + max) * 0.5]);
    }

    // Received data stats for debug only; do not log in production.

    if (minArray.length <= limit) {
      return { min: minArray, avg: avgArray, max: maxArray };
    }

    // Compute selected indices from the avg series so all three series remain
    // time-aligned after downsampling (fixes independent-downsampling misalignment).
    const indices =
      algorithm === 'LargestTriangeThreeBuckets'
        ? this.largestTriangleThreeBucketsIndices(avgArray, limit)
        : this.detectPeaksIndices(avgArray, limit);

    return {
      min: indices.map((i) => minArray[i]),
      avg: indices.map((i) => avgArray[i]),
      max: indices.map((i) => maxArray[i]),
    };
  }

  /**
   * Largest-Triangle-Three-Buckets (LTTB) — returns the indices of the selected
   * points rather than the points themselves so the same selection can be applied
   * to all series without time-axis misalignment.
   *
   * Key fix vs. the previous implementation: the centroid of the next bucket is now
   * computed by summing over every element in that bucket, not just the first one.
   */
  private largestTriangleThreeBucketsIndices(series: number[][], threshold: number): number[] {
    const n = series.length;

    if (threshold >= n || threshold === 0) {
      return series.map((_, i) => i);
    }

    if (threshold <= 2) {
      return [0, n - 1].slice(0, threshold);
    }

    const indices: number[] = [0];
    const bucketSize = (n - 2) / (threshold - 2);
    let selectedIndex = 0;

    for (let bucket = 0; bucket < threshold - 2; bucket++) {
      // Current bucket: the range of candidate points for this iteration.
      const rangeStart = Math.floor(bucket * bucketSize) + 1;
      const rangeEnd = Math.min(Math.floor((bucket + 1) * bucketSize) + 1, n - 1);

      // Next bucket: used to compute the centroid ("C" point of the triangle).
      const nextStart = Math.floor((bucket + 1) * bucketSize) + 1;
      const nextEnd = Math.min(Math.floor((bucket + 2) * bucketSize) + 1, n);
      const nextLen = nextEnd - nextStart;

      // Compute centroid of the FULL next bucket (previous code read only one point).
      let avgX = 0;
      let avgY = 0;

      for (let i = nextStart; i < nextEnd; i++) {
        avgX += series[i][0];
        avgY += series[i][1];
      }
      avgX /= nextLen;
      avgY /= nextLen;

      // "A" point: the previously selected point.
      const ax = series[selectedIndex][0];
      const ay = series[selectedIndex][1];

      // Pick the "B" point in the current bucket that maximises the triangle area A-B-C.
      let maxArea = -1;
      let maxIdx = rangeStart;

      for (let i = rangeStart; i < rangeEnd; i++) {
        const area =
          Math.abs((ax - avgX) * (series[i][1] - ay) - (ax - series[i][0]) * (avgY - ay)) * 0.5;

        if (area > maxArea) {
          maxArea = area;
          maxIdx = i;
        }
      }

      indices.push(maxIdx);
      selectedIndex = maxIdx;
    }

    indices.push(n - 1);

    return indices;
  }

  /**
   * Peak-detection downsampling — returns indices of detected peaks so the same
   * selection can be applied to all series without time-axis misalignment.
   */
  private detectPeaksIndices(
    data: number[][],
    maxPoints: number,
    windowSize: number = 3
  ): number[] {
    if (data.length < windowSize * 2 + 1) {
      console.warn('Not enough data points for the specified window size.');

      return data.map((_, i) => i);
    }

    const peakIndices: number[] = [];

    for (let i = windowSize; i < data.length - windowSize; i++) {
      const currentValue = data[i][1];
      const before = data.slice(i - windowSize, i).map((d) => d[1]);
      const after = data.slice(i + 1, i + 1 + windowSize).map((d) => d[1]);

      if (before.every((v) => currentValue > v) && after.every((v) => currentValue > v)) {
        peakIndices.push(i);
      }
    }

    if (peakIndices.length > maxPoints) {
      return this.downsamplePeakIndices(peakIndices, maxPoints);
    }

    return peakIndices;
  }

  private downsamplePeakIndices(peakIndices: number[], maxPoints: number): number[] {
    const step = Math.floor(peakIndices.length / maxPoints);
    const result: number[] = [];

    for (let i = 0; i < peakIndices.length; i += step) {
      result.push(peakIndices[i]);
    }

    return result.slice(0, maxPoints);
  }
}
