import type { IFetchResponse } from '@c8y/client';
import type { ApiCall, HttpHandler } from '@c8y/ngx-components/api';
import { firstValueFrom, of } from 'rxjs';
import {
  MIN_HISTORICAL_MS,
  clampCoverageTo,
  orderValues,
  responseColumnKeys,
  touchesLiveEdge,
  withNetworkFallback,
} from './interceptor-helpers';
import { type SeriesResponse } from './chart-data.service';

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

describe('touchesLiveEdge', () => {
  it('is true for gaps reaching into the last minutes before now', () => {
    expect(touchesLiveEdge(new Date())).toBeTrue();
    expect(touchesLiveEdge(new Date(Date.now() - MIN_HISTORICAL_MS + 1_000))).toBeTrue();
  });

  it('is false for gaps that end well in the past', () => {
    expect(touchesLiveEdge(new Date(Date.now() - MIN_HISTORICAL_MS - 1_000))).toBeFalse();
  });
});

describe('withNetworkFallback', () => {
  const req = { url: '/measurement/measurements', options: {} } as ApiCall;
  const networkResponse = { ok: true } as IFetchResponse;
  let next: jasmine.SpyObj<HttpHandler>;

  beforeEach(() => {
    next = jasmine.createSpyObj<HttpHandler>('HttpHandler', ['handle']);
    next.handle.and.returnValue(of(networkResponse));
  });

  it('answers from the cache when it works', async () => {
    const cached = { ok: true, status: 200 } as IFetchResponse;

    await expectAsync(
      firstValueFrom(withNetworkFallback(Promise.resolve(cached), req, next))
    ).toBeResolvedTo(cached);
    expect(next.handle).not.toHaveBeenCalled();
  });

  it('sends the request to the network when the cache fails (IndexedDB blocked, full, …)', async () => {
    const failing = Promise.reject(new DOMException('quota', 'QuotaExceededError'));

    await expectAsync(firstValueFrom(withNetworkFallback(failing, req, next))).toBeResolvedTo(
      networkResponse
    );
    expect(next.handle).toHaveBeenCalledWith(req);
  });

  it('passes a navigation abort on instead of refetching', async () => {
    const aborted = Promise.reject(new DOMException('aborted', 'AbortError'));

    await expectAsync(firstValueFrom(withNetworkFallback(aborted, req, next))).toBeRejected();
    expect(next.handle).not.toHaveBeenCalled();
  });
});
