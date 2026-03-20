import { MeasurementInterceptorService } from './measurement-interceptor.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Minimum `pageSize` accepted by the interceptor. */
const MIN_PAGE_SIZE = 100;

/** A date clearly in the past — always ≥ 5 min ago. */
const HISTORICAL = '2020-01-01T00:00:00.000Z';

/** Builds a minimal ApiCall-like object accepted by tryParseParams. */
function makeReq(url: string, params?: Record<string, unknown>) {
  return { url, options: params !== undefined ? { params } : {} } as any;
}

/** Calls the private tryParseParams method. */
function parse(service: MeasurementInterceptorService, req: unknown) {
  return (service as any).tryParseParams(req);
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('MeasurementInterceptorService.tryParseParams', () => {
  let service: MeasurementInterceptorService;

  /** Minimum valid params — all tests that want a successful parse start here. */
  const validParams = () => ({
    source: 'device-1',
    dateFrom: HISTORICAL,
    dateTo: '2020-01-01T12:00:00.000Z',
    pageSize: String(MIN_PAGE_SIZE),
  });

  beforeEach(() => {
    service = new MeasurementInterceptorService(null as any, null as any, null as any);
  });

  // ─── URL matching ────────────────────────────────────────────────────────────

  it('returns null when the URL does not end with measurement/measurements', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements/series', validParams()))).toBeNull();
  });

  it('returns null for an unrelated URL', () => {
    expect(parse(service, makeReq('https://example.com/inventory/managedObjects', validParams()))).toBeNull();
  });

  it('accepts a URL that ends with measurement/measurements', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements', validParams()))).not.toBeNull();
  });

  // ─── Missing params object ───────────────────────────────────────────────────

  it('returns null when options has no params', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements'))).toBeNull();
  });

  // ─── Required string params ──────────────────────────────────────────────────

  it('returns null when source is missing', () => {
    const { source: _, ...rest } = validParams();
    expect(parse(service, makeReq('https://example.com/measurement/measurements', rest))).toBeNull();
  });

  it('returns null when dateFrom is missing', () => {
    const { dateFrom: _, ...rest } = validParams();
    expect(parse(service, makeReq('https://example.com/measurement/measurements', rest))).toBeNull();
  });

  it('returns null when dateTo is missing', () => {
    const { dateTo: _, ...rest } = validParams();
    expect(parse(service, makeReq('https://example.com/measurement/measurements', rest))).toBeNull();
  });

  // ─── pageSize guard ──────────────────────────────────────────────────────────

  it('returns null when pageSize is absent', () => {
    const { pageSize: _, ...rest } = validParams();
    expect(parse(service, makeReq('https://example.com/measurement/measurements', rest))).toBeNull();
  });

  it('returns null when pageSize is below the minimum', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements', {
      ...validParams(),
      pageSize: String(MIN_PAGE_SIZE - 1),
    }))).toBeNull();
  });

  it('accepts exactly the minimum pageSize', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements', {
      ...validParams(),
      pageSize: String(MIN_PAGE_SIZE),
    }))).not.toBeNull();
  });

  it('accepts a pageSize above the minimum', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements', {
      ...validParams(),
      pageSize: '2000',
    }))).not.toBeNull();
  });

  // ─── Date validation ─────────────────────────────────────────────────────────

  it('returns null when dateFrom is not a valid ISO string', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements', {
      ...validParams(),
      dateFrom: 'not-a-date',
    }))).toBeNull();
  });

  it('returns null when dateTo is not a valid ISO string', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements', {
      ...validParams(),
      dateTo: 'not-a-date',
    }))).toBeNull();
  });

  // ─── Staleness guard ─────────────────────────────────────────────────────────

  it('returns null when dateFrom is within 5 minutes of now', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements', {
      ...validParams(),
      dateFrom: new Date().toISOString(),
    }))).toBeNull();
  });

  it('accepts dateFrom that is well in the past', () => {
    expect(parse(service, makeReq('https://example.com/measurement/measurements', validParams()))).not.toBeNull();
  });

  // ─── Returned shape ──────────────────────────────────────────────────────────

  it('returns parsed source, dateFrom, dateTo as Date objects', () => {
    const result = parse(service, makeReq('https://example.com/measurement/measurements', validParams()));

    expect(result.source).toBe('device-1');
    expect(result.dateFrom).toEqual(new Date(HISTORICAL));
    expect(result.dateTo).toEqual(new Date('2020-01-01T12:00:00.000Z'));
  });

  it('defaults fragmentType and fragmentSeries to empty strings when absent', () => {
    const result = parse(service, makeReq('https://example.com/measurement/measurements', validParams()));

    expect(result.fragmentType).toBe('');
    expect(result.fragmentSeries).toBe('');
  });

  it('captures valueFragmentType and valueFragmentSeries when present', () => {
    const result = parse(service, makeReq('https://example.com/measurement/measurements', {
      ...validParams(),
      valueFragmentType: 'c8y_Temperature',
      valueFragmentSeries: 'T',
    }));

    expect(result.fragmentType).toBe('c8y_Temperature');
    expect(result.fragmentSeries).toBe('T');
  });
});
