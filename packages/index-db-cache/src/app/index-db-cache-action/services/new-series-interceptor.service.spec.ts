import { NewSeriesInterceptorService, iso8601DurationMs } from './new-series-interceptor.service';

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
});

// ─── iso8601DurationMs ────────────────────────────────────────────────────────

describe('iso8601DurationMs', () => {
  // ─── Valid ISO 8601 durations ─────────────────────────────────────────────

  it('PT300S → 300 000 ms', () => {
    expect(iso8601DurationMs('PT300S')).toBe(300 * 1_000);
  });

  it('PT25M → 1 500 000 ms', () => {
    expect(iso8601DurationMs('PT25M')).toBe(25 * 60_000);
  });

  it('PT12H → 43 200 000 ms', () => {
    expect(iso8601DurationMs('PT12H')).toBe(12 * 3_600_000);
  });

  it('P7D → 604 800 000 ms', () => {
    expect(iso8601DurationMs('P7D')).toBe(7 * 24 * 3_600_000);
  });

  it('P4W → 2 419 200 000 ms', () => {
    expect(iso8601DurationMs('P4W')).toBe(4 * 7 * 24 * 3_600_000);
  });

  it('P3M uses 30.44-day months', () => {
    expect(iso8601DurationMs('P3M')).toBe(3 * 30.44 * 24 * 3_600_000);
  });

  it('P1Y uses 365.25-day years', () => {
    expect(iso8601DurationMs('P1Y')).toBe(365.25 * 24 * 3_600_000);
  });

  // ─── Combined durations ───────────────────────────────────────────────────

  it('PT1H30M → 5 400 000 ms', () => {
    expect(iso8601DurationMs('PT1H30M')).toBe(90 * 60_000);
  });

  it('P1DT12H → 1.5 days in ms', () => {
    expect(iso8601DurationMs('P1DT12H')).toBe(36 * 3_600_000);
  });

  it('PT0.5S → 500 ms (decimal seconds)', () => {
    expect(iso8601DurationMs('PT0.5S')).toBe(500);
  });

  // ─── Edge cases ───────────────────────────────────────────────────────────

  it('P0D → 0 ms', () => {
    expect(iso8601DurationMs('P0D')).toBe(0);
  });

  // ─── Invalid / non-ISO-8601 shorthand → 0 ────────────────────────────────

  it('"300s" (no P prefix) → 0', () => {
    expect(iso8601DurationMs('300s')).toBe(0);
  });

  it('"25m" (no P prefix) → 0', () => {
    expect(iso8601DurationMs('25m')).toBe(0);
  });

  it('"12h" (no P prefix) → 0', () => {
    expect(iso8601DurationMs('12h')).toBe(0);
  });

  it('"7d" (no P prefix) → 0', () => {
    expect(iso8601DurationMs('7d')).toBe(0);
  });

  it('"4w" (no P prefix) → 0', () => {
    expect(iso8601DurationMs('4w')).toBe(0);
  });

  it('"3M" (no P prefix) → 0', () => {
    expect(iso8601DurationMs('3M')).toBe(0);
  });

  it('"2q" (quarters — not ISO 8601) → 0', () => {
    expect(iso8601DurationMs('2q')).toBe(0);
  });

  it('"1y" (no P prefix) → 0', () => {
    expect(iso8601DurationMs('1y')).toBe(0);
  });

  it('empty string → 0', () => {
    expect(iso8601DurationMs('')).toBe(0);
  });

  it('arbitrary garbage → 0', () => {
    expect(iso8601DurationMs('not-a-duration')).toBe(0);
  });
});
