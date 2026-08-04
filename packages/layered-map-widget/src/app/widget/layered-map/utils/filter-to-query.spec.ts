import { filterToQueryString, unwrapFilter } from './filter-to-query';

describe('unwrapFilter', () => {
  it('strips $filter= prefix', () => {
    expect(unwrapFilter("$filter=(type eq 'Pump')")).toBe("type eq 'Pump'");
  });

  it('strips surrounding parentheses', () => {
    expect(unwrapFilter("(type eq 'Pump')")).toBe("type eq 'Pump'");
  });

  it('strips both prefix and parentheses', () => {
    expect(unwrapFilter('$filter=(has(c8y_IsDevice))')).toBe('has(c8y_IsDevice)');
  });

  it('returns plain strings unchanged', () => {
    expect(unwrapFilter("type eq 'Pump'")).toBe("type eq 'Pump'");
  });

  it('trims surrounding whitespace', () => {
    expect(unwrapFilter("  (type eq 'A')  ")).toBe("type eq 'A'");
  });
});

describe('filterToQueryString', () => {
  it('returns empty string for empty filter', () => {
    expect(filterToQueryString({})).toBe('');
  });

  it('skips null, undefined and empty-string values', () => {
    expect(filterToQueryString({ a: null, b: undefined, c: '' })).toBe('');
  });

  it('maps a plain string property to key eq value', () => {
    expect(filterToQueryString({ type: 'Pump' })).toBe("type eq 'Pump'");
  });

  it('maps a numeric property without quotes', () => {
    expect(filterToQueryString({ priority: 5 })).toBe('priority eq 5');
  });

  it('maps a boolean property without quotes', () => {
    expect(filterToQueryString({ active: true })).toBe('active eq true');
  });

  it('maps fragmentType to has(value)', () => {
    expect(filterToQueryString({ fragmentType: 'c8y_IsDevice' })).toBe('has(c8y_IsDevice)');
  });

  it('maps ids to OR clauses via QueriesUtil __in', () => {
    // QueriesUtil serialises __in as (id eq '1') or (id eq '2') or ...
    const result = filterToQueryString({ ids: '1,2,3' });

    expect(result).toContain("id eq '1'");
    expect(result).toContain("id eq '2'");
    expect(result).toContain("id eq '3'");
  });

  it('inlines and unwraps a stored query clause via ReverseQueriesUtil', () => {
    expect(filterToQueryString({ query: '$filter=(has(c8y_IsDevice))' })).toBe('has(c8y_IsDevice)');
  });

  it('round-trips a comparison query string', () => {
    expect(filterToQueryString({ query: "$filter=(type eq 'Pump')" })).toBe("type eq 'Pump'");
  });

  it('joins multiple clauses with and', () => {
    const result = filterToQueryString({ type: 'Pump', fragmentType: 'c8y_IsDevice' });

    // QueriesUtil wraps each clause in parens when combining
    expect(result).toContain("type eq 'Pump'");
    expect(result).toContain('has(c8y_IsDevice)');
    expect(result).toContain(' and ');
  });

  it('skips object, symbol, bigint and function values', () => {
    const filter: Record<string, unknown> = {
      a: Symbol('x'),
      b: BigInt(1),
      c: () => {},
      d: { nested: true },
      name: 'kept',
    };

    expect(filterToQueryString(filter)).toBe("name eq 'kept'");
  });
});
