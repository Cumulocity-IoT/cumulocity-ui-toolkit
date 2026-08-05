import {
  MIN_HISTORICAL_MS,
  clampCoverageTo,
  orderValues,
  responseColumnKeys,
} from './interceptor-helpers';
import { SeriesResponse } from './chart-data.service';

describe('clampCoverageTo', () => {
  it('returns `to` unchanged when it is older than the live-edge limit', () => {
    const from = new Date('2020-01-01T00:00:00.000Z');
    const to = new Date('2020-01-02T00:00:00.000Z');

    expect(clampCoverageTo(from, to)).toEqual(to);
  });

  it('clamps `to` to now - MIN_HISTORICAL_MS when it reaches into the live edge', () => {
    const from = new Date(Date.now() - 24 * 3_600_000);
    const to = new Date();
    const clamped = clampCoverageTo(from, to);

    expect(clamped.getTime()).toBeLessThanOrEqual(Date.now() - MIN_HISTORICAL_MS);
    expect(clamped.getTime()).toBeGreaterThan(from.getTime());
  });

  it('never clamps below `from` (fully-live gap → zero-width coverage)', () => {
    const from = new Date(Date.now() - 60_000);
    const to = new Date();

    expect(clampCoverageTo(from, to)).toEqual(from);
  });
});

describe('orderValues', () => {
  const values = {
    '2020-01-02T00:00:00.000Z': 2,
    '2020-01-01T00:00:00.000Z': 1,
    '2020-01-03T00:00:00.000Z': 3,
  };

  it('orders keys ascending (oldest first, matching the live API)', () => {
    expect(Object.values(orderValues(values))).toEqual([1, 2, 3]);
  });
});

describe('responseColumnKeys', () => {
  const requested = ['c8y_Temperature.T', 'c8y_Humidity.H'];

  it('derives keys from the response series array, honouring its order', () => {
    const body: SeriesResponse = {
      values: {},
      series: [
        { unit: '%RH', name: 'H', type: 'c8y_Humidity' },
        { unit: 'C', name: 'T', type: 'c8y_Temperature' },
      ],
      truncated: false,
    };

    expect(responseColumnKeys(body, requested)).toEqual(['c8y_Humidity.H', 'c8y_Temperature.T']);
  });

  it('falls back to the requested keys when the response has no series metadata', () => {
    const body: SeriesResponse = { values: {}, series: [], truncated: false };

    expect(responseColumnKeys(body, requested)).toEqual(requested);
  });
});
