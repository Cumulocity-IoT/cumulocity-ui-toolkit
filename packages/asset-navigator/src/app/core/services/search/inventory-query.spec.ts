import { clampPageSize, compileToInventoryParams, toQueryString } from './inventory-query';

/**
 * These assert the platform quirks the compiler exists to encode. Each one is a bug that has
 * actually shipped in a Cumulocity plugin, so the test is the documentation.
 */
describe('compileToInventoryParams', () => {
  it('never emits a standalone `type` parameter, because the platform ignores it when `query` is present', () => {
    const { params } = compileToInventoryParams({ typeChips: ['wind_turbine'] });

    expect(params['type']).toBeUndefined();
    expect(params['query']).toBe("$filter=type eq 'wind_turbine'");
  });

  it('ORs several type chips inside one parenthesised term', () => {
    const { params } = compileToInventoryParams({ typeChips: ['wind_park', 'wind_turbine'] });

    expect(params['query']).toBe("$filter=(type eq 'wind_park' or type eq 'wind_turbine')");
  });

  it('sends free text as `text=` and never as a filter term, since there is no `like`', () => {
    const { params, filter } = compileToInventoryParams({ text: '  Rostock  ' });

    expect(params['text']).toBe('Rostock');
    expect(filter).toBeUndefined();
    expect(params['query']).toBeUndefined();
  });

  it('strips single quotes rather than escaping them — the language documents no escape', () => {
    const { params } = compileToInventoryParams({ typeChips: ["wind'turbine"] });

    expect(params['query']).toBe("$filter=type eq 'windturbine'");
  });

  it('drops control characters from a literal', () => {
    const { params } = compileToInventoryParams({ typeChips: ['wind\u0001turbine'] });

    expect(params['query']).toBe("$filter=type eq 'windturbine'");
  });

  it("drops a chip that sanitizes down to nothing instead of emitting `type eq ''`", () => {
    const { params, filter } = compileToInventoryParams({ typeChips: ["'''"] });

    expect(filter).toBeUndefined();
    expect(params['query']).toBeUndefined();
  });

  it('reads active alarms off the MO fragment, with integer counts and no `f` suffix', () => {
    const { params } = compileToInventoryParams({ activeAlarmSeverities: ['critical'] });

    expect(params['query']).toBe('$filter=c8y_ActiveAlarmsStatus.critical gt 0');
  });

  it('ORs several severities and ANDs them against the rest of the filter', () => {
    const { filter } = compileToInventoryParams({
      typeChips: ['wind_turbine'],
      activeAlarmSeverities: ['critical', 'major'],
    });

    expect(filter).toBe(
      "type eq 'wind_turbine' and (c8y_ActiveAlarmsStatus.critical gt 0 or c8y_ActiveAlarmsStatus.major gt 0)"
    );
  });

  it('parenthesises the whole filter once there is more than one term', () => {
    const { params } = compileToInventoryParams({
      onlyAssetsOrDevices: true,
      typeChips: ['wind_turbine'],
    });

    expect(params['query']).toBe(
      "$filter=(type eq 'wind_turbine' and (has(c8y_IsAsset) or has(c8y_IsDevice)))"
    );
  });

  it('always asks the platform to skip children, which it recommends for performance', () => {
    const { params } = compileToInventoryParams({});

    expect(params['withChildren']).toBe('false');
    expect(params['skipChildrenNames']).toBe('true');
  });

  it('includes parents by default and omits them when asked, since ancestors dominate the cost', () => {
    expect(compileToInventoryParams({}).params['withParents']).toBe('true');
    expect(
      compileToInventoryParams({}, { withParents: false }).params['withParents']
    ).toBeUndefined();
  });

  it('requests a total count only when asked, because totals are expensive', () => {
    expect(compileToInventoryParams({}).params['withTotalElements']).toBeUndefined();
    expect(
      compileToInventoryParams({}, { withTotalElements: true }).params['withTotalElements']
    ).toBe('true');
  });

  it('encodes the query string, so the space between filter parts survives transport', () => {
    const compiled = compileToInventoryParams({ text: 'a b', typeChips: ['wind_turbine'] });

    expect(toQueryString(compiled)).toContain('text=a+b');
    expect(toQueryString(compiled)).toContain('query=%24filter%3Dtype+eq+%27wind_turbine%27');
  });
});

describe('clampPageSize', () => {
  it('defaults to 100, because the platform default of 5 is never what a search wants', () => {
    expect(clampPageSize(undefined)).toBe(100);
    expect(clampPageSize(Number.NaN)).toBe(100);
  });

  it('clamps to the platform bounds and truncates a fractional size', () => {
    expect(clampPageSize(0)).toBe(1);
    expect(clampPageSize(-5)).toBe(1);
    expect(clampPageSize(5000)).toBe(2000);
    expect(clampPageSize(49.7)).toBe(49);
  });
});
