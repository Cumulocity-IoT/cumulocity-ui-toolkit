import { OldSeriesInterceptorService } from './old-series-interceptor.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** A date clearly in the past — always ≥ 5 min ago. */
const HISTORICAL = '2020-01-01T00:00:00.000Z';
const HISTORICAL_TO = '2020-01-02T00:00:00.000Z';

const SERIES_URL = 'https://example.com/measurement/measurements/series';

function makeReq(url: string, params?: Record<string, unknown>) {
  return { url, options: params !== undefined ? { params } : {} } as any;
}

function parse(service: OldSeriesInterceptorService, req: unknown) {
  return (service as any).tryParseParams(req);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('OldSeriesInterceptorService.tryParseParams', () => {
  let service: OldSeriesInterceptorService;

  const validParams = () => ({
    source: 'device-1',
    dateFrom: HISTORICAL,
    dateTo: HISTORICAL_TO,
    aggregationType: 'HOURLY',
    series: 'c8y_Temperature.T',
  });

  beforeEach(() => {
    service = new OldSeriesInterceptorService(null as any, null as any, null as any);
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

  it('returns null when aggregationType is missing', () => {
    const { aggregationType: _, ...rest } = validParams();
    expect(parse(service, makeReq(SERIES_URL, rest))).toBeNull();
  });

  it('returns null when series param is absent', () => {
    const { series: _, ...rest } = validParams();
    expect(parse(service, makeReq(SERIES_URL, rest))).toBeNull();
  });

  // ─── aggregationType validation ──────────────────────────────────────────────

  it('accepts DAILY aggregationType', () => {
    expect(parse(service, makeReq(SERIES_URL, { ...validParams(), aggregationType: 'DAILY' }))).not.toBeNull();
  });

  it('accepts HOURLY aggregationType', () => {
    expect(parse(service, makeReq(SERIES_URL, { ...validParams(), aggregationType: 'HOURLY' }))).not.toBeNull();
  });

  it('accepts MINUTELY aggregationType', () => {
    expect(parse(service, makeReq(SERIES_URL, { ...validParams(), aggregationType: 'MINUTELY' }))).not.toBeNull();
  });

  it('returns null for an unknown aggregationType', () => {
    expect(parse(service, makeReq(SERIES_URL, { ...validParams(), aggregationType: 'YEARLY' }))).toBeNull();
  });

  it('returns null for an empty aggregationType string', () => {
    expect(parse(service, makeReq(SERIES_URL, { ...validParams(), aggregationType: '' }))).toBeNull();
  });

  // ─── aggregationInterval exclusion guard ─────────────────────────────────────

  it('returns null when aggregationInterval is present (defers to new-series interceptor)', () => {
    expect(parse(service, makeReq(SERIES_URL, {
      ...validParams(),
      aggregationInterval: 'PT1H',
    }))).toBeNull();
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

  it('returns aggregationType as a typed string', () => {
    const result = parse(service, makeReq(SERIES_URL, { ...validParams(), aggregationType: 'DAILY' }));
    expect(result.aggregationType).toBe('DAILY');
  });
});
