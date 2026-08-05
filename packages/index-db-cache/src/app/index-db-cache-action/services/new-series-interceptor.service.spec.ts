import { NewSeriesInterceptorService, aggregationIntervalMs } from './new-series-interceptor.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A date clearly in the past — always ≥ 5 min ago. */
const HISTORICAL = '2020-01-01T00:00:00.000Z';
const HISTORICAL_TO = '2020-01-02T00:00:00.000Z';

const SERIES_URL = 'https://example.com/measurement/measurements/series';

function makeReq(url: string, params?: Record<string, unknown>) {
  return { url, options: params !== undefined ? { params } : {} } as any;
}

function parse(service: NewSeriesInterceptorService, req: unknown) {
  return (service as any).tryParseParams(req);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('NewSeriesInterceptorService.tryParseParams', () => {
  let service: NewSeriesInterceptorService;

  const validParams = () => ({
    source: 'device-1',
    dateFrom: HISTORICAL,
    dateTo: HISTORICAL_TO,
    aggregationInterval: 'PT1H',
    series: 'c8y_Temperature.T',
  });

  beforeEach(() => {
    service = new NewSeriesInterceptorService(null as any, null as any, null as any);
  });

  // ─── URL matching ────────────────────────────────────────────────────────────

  it('returns null when URL ends with measurement/measurements (list endpoint)', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements', validParams()))).toBeNull();
  });

  it('returns null for an unrelated URL', () => {
    expect(parse(service, makeReq('https://example.com/inventory/managedObjects', validParams()))).toBeNull();
  });

  it('accepts a URL ending with measurement/measurements/series', () => {
    expect(parse(service, makeReq(SERIES_URL, validParams()))).not.toBeNull();
  });

  // ─── Missing params object ───────────────────────────────────────────────────

  it('returns null when options has no params', () => {
    expect(parse(service, makeReq(SERIES_URL))).toBeNull();
  });

  // ─── Required params ─────────────────────────────────────────────────────────

  it('returns null when source is missing', () => {
    const { source: _, ...rest } = validParams();
    expect(parse(service, makeReq(SERIES_URL, rest))).toBeNull();
  });

  it('returns null when dateFrom is missing', () => {
    const { dateFrom: _, ...rest } = validParams();
    expect(parse(service, makeReq(SERIES_URL, rest))).toBeNull();
  });

  it('returns null when dateTo is missing', () => {
    const { dateTo: _, ...rest } = validParams();
    expect(parse(service, makeReq(SERIES_URL, rest))).toBeNull();
  });

  it('returns null when aggregationInterval is missing', () => {
    const { aggregationInterval: _, ...rest } = validParams();
    expect(parse(service, makeReq(SERIES_URL, rest))).toBeNull();
  });

  it('returns null when series param is absent', () => {
    const { series: _, ...rest } = validParams();
    expect(parse(service, makeReq(SERIES_URL, rest))).toBeNull();
  });

  // ─── series param normalisation ──────────────────────────────────────────────

  it('wraps a single series string into a one-element array', () => {
    const result = parse(service, makeReq(SERIES_URL, validParams()));
    expect(result.seriesKeys).toEqual(['c8y_Temperature.T']);
  });

  it('preserves an array of series strings', () => {
    const result = parse(service, makeReq(SERIES_URL, {
      ...validParams(),
      series: ['c8y_Temperature.T', 'c8y_Humidity.H'],
    }));
    expect(result.seriesKeys).toEqual(['c8y_Temperature.T', 'c8y_Humidity.H']);
  });

  // ─── Date validation ─────────────────────────────────────────────────────────

  it('returns null when dateFrom is not a valid date string', () => {
    expect(parse(service, makeReq(SERIES_URL, { ...validParams(), dateFrom: 'bad' }))).toBeNull();
  });

  it('returns null when dateTo is not a valid date string', () => {
    expect(parse(service, makeReq(SERIES_URL, { ...validParams(), dateTo: 'bad' }))).toBeNull();
  });

  // ─── Staleness guard ─────────────────────────────────────────────────────────

  it('returns null when dateFrom is within 5 minutes of now', () => {
    expect(parse(service, makeReq(SERIES_URL, {
      ...validParams(),
      dateFrom: new Date().toISOString(),
    }))).toBeNull();
  });

  it('accepts dateFrom well in the past', () => {
    expect(parse(service, makeReq(SERIES_URL, validParams()))).not.toBeNull();
  });

  // ─── Returned shape ──────────────────────────────────────────────────────────

  it('returns parsed source, dateFrom and dateTo as Date objects', () => {
    const result = parse(service, makeReq(SERIES_URL, validParams()));

    expect(result.source).toBe('device-1');
    expect(result.dateFrom).toEqual(new Date(HISTORICAL));
    expect(result.dateTo).toEqual(new Date(HISTORICAL_TO));
  });

  it('returns aggregationInterval unchanged', () => {
    const result = parse(service, makeReq(SERIES_URL, validParams()));
    expect(result.aggregationInterval).toBe('PT1H');
  });

  it('handles daily aggregation interval', () => {
    const result = parse(service, makeReq(SERIES_URL, { ...validParams(), aggregationInterval: 'P1D' }));
    expect(result.aggregationInterval).toBe('P1D');
  });

  // ─── Cache key (aggKey) ──────────────────────────────────────────────────────

  it('uses the bare interval as aggKey when no aggregationFunction is present', () => {
    const result = parse(service, makeReq(SERIES_URL, validParams()));
    expect(result.aggKey).toBe('PT1H');
  });

  it('folds a single aggregationFunction into aggKey', () => {
    const result = parse(
      service,
      makeReq(SERIES_URL, { ...validParams(), aggregationFunction: 'avg' })
    );
    expect(result.aggKey).toBe('PT1H|avg');
  });

  it('folds multiple aggregationFunctions into aggKey in sorted order', () => {
    const result = parse(
      service,
      makeReq(SERIES_URL, { ...validParams(), aggregationFunction: ['sum', 'avg', 'count'] })
    );
    expect(result.aggKey).toBe('PT1H|avg,count,sum');
  });

});

// ─── aggregationIntervalMs ────────────────────────────────────────────────────

describe('aggregationIntervalMs', () => {
  // ─── Cumulocity API format (integer + unit letter) ───────────────────────

  it('"300s" → 300 000 ms', () => {
    expect(aggregationIntervalMs('300s')).toBe(300 * 1_000);
  });

  it('"25m" → 1 500 000 ms', () => {
    expect(aggregationIntervalMs('25m')).toBe(25 * 60_000);
  });

  it('"12h" → 43 200 000 ms', () => {
    expect(aggregationIntervalMs('12h')).toBe(12 * 3_600_000);
  });

  it('"7d" → 604 800 000 ms', () => {
    expect(aggregationIntervalMs('7d')).toBe(7 * 24 * 3_600_000);
  });

  it('"4w" → 2 419 200 000 ms', () => {
    expect(aggregationIntervalMs('4w')).toBe(4 * 7 * 24 * 3_600_000);
  });

  it('"3M" uses 30.44-day months', () => {
    expect(aggregationIntervalMs('3M')).toBeCloseTo(3 * 30.44 * 24 * 3_600_000, 0);
  });

  it('"2q" uses 3-month quarters', () => {
    expect(aggregationIntervalMs('2q')).toBeCloseTo(2 * 3 * 30.44 * 24 * 3_600_000, 0);
  });

  it('"1y" uses 365.25-day years', () => {
    expect(aggregationIntervalMs('1y')).toBe(365.25 * 24 * 3_600_000);
  });

  it('"999s" accepts the three-digit maximum', () => {
    expect(aggregationIntervalMs('999s')).toBe(999 * 1_000);
  });

  it('"0s" (not a positive integer) → 0', () => {
    expect(aggregationIntervalMs('0s')).toBe(0);
  });

  it('"012h" (leading zero) → 0', () => {
    expect(aggregationIntervalMs('012h')).toBe(0);
  });

  it('"1000s" (more than three digits) → 0', () => {
    expect(aggregationIntervalMs('1000s')).toBe(0);
  });

  it('"5x" (unknown unit) → 0', () => {
    expect(aggregationIntervalMs('5x')).toBe(0);
  });

  // ─── ISO 8601 durations (accepted for robustness) ────────────────────────

  it('PT300S → 300 000 ms', () => {
    expect(aggregationIntervalMs('PT300S')).toBe(300 * 1_000);
  });

  it('PT12H → 43 200 000 ms', () => {
    expect(aggregationIntervalMs('PT12H')).toBe(12 * 3_600_000);
  });

  it('P7D → 604 800 000 ms', () => {
    expect(aggregationIntervalMs('P7D')).toBe(7 * 24 * 3_600_000);
  });

  it('PT1H30M → 5 400 000 ms', () => {
    expect(aggregationIntervalMs('PT1H30M')).toBe(90 * 60_000);
  });

  it('P1DT12H → 1.5 days in ms', () => {
    expect(aggregationIntervalMs('P1DT12H')).toBe(36 * 3_600_000);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  it('P0D → 0 ms', () => {
    expect(aggregationIntervalMs('P0D')).toBe(0);
  });

  it('empty string → 0', () => {
    expect(aggregationIntervalMs('')).toBe(0);
  });

  it('arbitrary garbage → 0', () => {
    expect(aggregationIntervalMs('not-a-duration')).toBe(0);
  });
});
