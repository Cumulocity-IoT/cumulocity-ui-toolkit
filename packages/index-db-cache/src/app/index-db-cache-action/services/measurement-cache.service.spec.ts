import { MeasurementCacheService } from './measurement-cache.service';

describe('MeasurementCacheService.computeGaps', () => {
  let service: MeasurementCacheService;

  // Helpers to build ISO strings and Dates from short notation
  const iso = (s: string): string => new Date(s).toISOString();
  const d = (s: string): Date => new Date(s);

  beforeEach(() => {
    service = new MeasurementCacheService();
  });

  it('returns the full range as one gap when coverage is empty', () => {
    const gaps = service.computeGaps([], d('2024-01-01T00:00:00Z'), d('2024-01-01T12:00:00Z'));

    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toEqual(d('2024-01-01T00:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T12:00:00Z'));
  });

  it('returns no gaps when coverage exactly matches the requested range', () => {
    const coverage = [{ from: iso('2024-01-01T00:00:00Z'), to: iso('2024-01-01T12:00:00Z') }];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(0);
  });

  it('returns no gaps when coverage is a superset of the requested range', () => {
    const coverage = [{ from: iso('2023-12-31T00:00:00Z'), to: iso('2024-01-02T00:00:00Z') }];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(0);
  });

  it('returns the full range as one gap when coverage is entirely before the range', () => {
    const coverage = [{ from: iso('2023-12-30T00:00:00Z'), to: iso('2023-12-31T00:00:00Z') }];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toEqual(d('2024-01-01T00:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T12:00:00Z'));
  });

  it('returns the full range as one gap when coverage is entirely after the range', () => {
    const coverage = [{ from: iso('2024-01-02T00:00:00Z'), to: iso('2024-01-03T00:00:00Z') }];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toEqual(d('2024-01-01T00:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T12:00:00Z'));
  });

  it('returns a gap at the start when coverage begins after dateFrom', () => {
    const coverage = [{ from: iso('2024-01-01T06:00:00Z'), to: iso('2024-01-01T12:00:00Z') }];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toEqual(d('2024-01-01T00:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T06:00:00Z'));
  });

  it('returns a gap at the end when coverage ends before dateTo', () => {
    const coverage = [{ from: iso('2024-01-01T00:00:00Z'), to: iso('2024-01-01T06:00:00Z') }];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toEqual(d('2024-01-01T06:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T12:00:00Z'));
  });

  it('returns a single middle gap when coverage appears before and after it', () => {
    const coverage = [
      { from: iso('2024-01-01T00:00:00Z'), to: iso('2024-01-01T04:00:00Z') },
      { from: iso('2024-01-01T08:00:00Z'), to: iso('2024-01-01T12:00:00Z') },
    ];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toEqual(d('2024-01-01T04:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T08:00:00Z'));
  });

  it('returns start-gap and end-gap when a single interval covers only the middle', () => {
    const coverage = [{ from: iso('2024-01-01T04:00:00Z'), to: iso('2024-01-01T08:00:00Z') }];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(2);
    expect(gaps[0].from).toEqual(d('2024-01-01T00:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T04:00:00Z'));
    expect(gaps[1].from).toEqual(d('2024-01-01T08:00:00Z'));
    expect(gaps[1].to).toEqual(d('2024-01-01T12:00:00Z'));
  });

  it('merges overlapping coverage intervals before computing gaps', () => {
    // Two intervals overlap: [00-06] and [04-10] merge into [00-10], leaving one gap [10-12]
    const coverage = [
      { from: iso('2024-01-01T00:00:00Z'), to: iso('2024-01-01T06:00:00Z') },
      { from: iso('2024-01-01T04:00:00Z'), to: iso('2024-01-01T10:00:00Z') },
    ];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toEqual(d('2024-01-01T10:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T12:00:00Z'));
  });

  it('correctly handles coverage provided out-of-order', () => {
    const coverage = [
      { from: iso('2024-01-01T08:00:00Z'), to: iso('2024-01-01T12:00:00Z') },
      { from: iso('2024-01-01T00:00:00Z'), to: iso('2024-01-01T04:00:00Z') },
    ];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toEqual(d('2024-01-01T04:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T08:00:00Z'));
  });

  it('excludes coverage that only touches the boundary (to === reqFrom)', () => {
    // Interval ends exactly at dateFrom — not overlapping (to > reqFrom is false)
    const coverage = [{ from: iso('2023-12-31T00:00:00Z'), to: iso('2024-01-01T00:00:00Z') }];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(1);
    expect(gaps[0].from).toEqual(d('2024-01-01T00:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T12:00:00Z'));
  });

  it('produces two separate gaps when three coverage intervals leave two holes', () => {
    const coverage = [
      { from: iso('2024-01-01T00:00:00Z'), to: iso('2024-01-01T02:00:00Z') },
      { from: iso('2024-01-01T04:00:00Z'), to: iso('2024-01-01T06:00:00Z') },
      { from: iso('2024-01-01T08:00:00Z'), to: iso('2024-01-01T12:00:00Z') },
    ];

    const gaps = service.computeGaps(
      coverage,
      d('2024-01-01T00:00:00Z'),
      d('2024-01-01T12:00:00Z')
    );

    expect(gaps).toHaveLength(2);
    expect(gaps[0].from).toEqual(d('2024-01-01T02:00:00Z'));
    expect(gaps[0].to).toEqual(d('2024-01-01T04:00:00Z'));
    expect(gaps[1].from).toEqual(d('2024-01-01T06:00:00Z'));
    expect(gaps[1].to).toEqual(d('2024-01-01T08:00:00Z'));
  });
});
