import {
  addChip,
  freeTextOf,
  parseFieldExpression,
  rankScopes,
  suggestChips,
  toSearchQuery,
  type QueryChip,
  type TypeOption,
} from './query-chips';
import { compileToInventoryParams } from './inventory-query';
import { SearchCorpusService } from './search-corpus.service';
import type { SearchResult } from './search.model';

function result(overrides: Partial<SearchResult> & { id: string }): SearchResult {
  return {
    name: overrides.id,
    type: '',
    isDevice: false,
    isAsset: true,
    breadcrumb: [],
    keywords: '',
    highlights: [],
    ...overrides,
  };
}

const types: TypeOption[] = [
  { type: 'wind_park', label: 'Wind park' },
  { type: 'wind_turbine', label: 'Wind turbine' },
  { type: 'bess_container', label: 'Bess container' },
];

// Realistic numeric ids — c8y ids are numeric strings, and the scope filter compiles them.
const husumPark = result({
  id: '4711',
  name: 'Husum',
  type: 'wind_park',
  breadcrumb: ['Region North'],
});
const husumRegion = result({ id: '815', name: 'Husum', type: 'service_region' });
/** Scope fixtures as `rankScopes` returns them, all plainly named by the term. */
const strong = (...scopes: SearchResult[]) => scopes.map((scope) => ({ scope, strong: true }));

describe('parseFieldExpression', () => {
  it('reads known fields, with `asset:` and `type:` as one filter', () => {
    expect(parseFieldExpression('type:wind')).toEqual({ field: 'type', value: 'wind' });
    expect(parseFieldExpression('Asset: wind')).toEqual({ field: 'type', value: 'wind' });
    expect(parseFieldExpression('alarms:crit')).toEqual({ field: 'alarm', value: 'crit' });
    // There is no name field — the free text is the name search.
    expect(parseFieldExpression('name:Husum')).toBeUndefined();
    expect(parseFieldExpression('in:')).toEqual({ field: 'in', value: '' });
  });

  it('leaves an unknown prefix as free text, so "T4: gearbox" is still a search', () => {
    expect(parseFieldExpression('T4: gearbox')).toBeUndefined();
    expect(freeTextOf('T4: gearbox')).toBe('T4: gearbox');
  });

  it('keeps a half-built field expression out of the ranked text', () => {
    expect(freeTextOf('type:wi')).toBe('');
    expect(freeTextOf('  husum ')).toBe('husum');
  });
});

describe('suggestChips', () => {
  it('offers every reading of an ambiguous word, scopes first', () => {
    const suggestions = suggestChips('Husum', [], {
      types,
      scopesFor: () => strong(husumPark, husumRegion),
    });

    expect(suggestions.map((s) => `${s.chip.field}:${s.chip.value}`)).toEqual([
      'in:4711',
      'in:815',
    ]);
    expect(suggestions[0]).toEqual(
      jasmine.objectContaining({ typeLabel: 'wind_park', detail: 'Region North' })
    );
  });

  it('labels a scope by its type label when one is supplied', () => {
    const [first] = suggestChips('Husum', [], {
      types,
      scopesFor: () => strong(husumPark),
      typeLabel: (type) => (type === 'wind_park' ? 'Wind park' : type),
    });

    expect(first.typeLabel).toBe('Wind park');
  });

  it('narrows to the typed field, and browses its values when none is typed yet', () => {
    expect(
      suggestChips('type:', [], { types, scopesFor: () => strong(husumPark) }).map(
        (s) => s.chip.value
      )
    ).toEqual(['wind_park', 'wind_turbine', 'bess_container']);
    expect(
      suggestChips('asset:turb', [], { types, scopesFor: () => [] }).map((s) => s.chip.value)
    ).toEqual(['wind_turbine']);
    expect(
      suggestChips('alarm:', [], { types, scopesFor: () => [] }).map((s) => s.chip.value)
    ).toEqual(['critical', 'major', 'minor', 'warning']);
  });

  it('suggests a severity from free text only on a prefix', () => {
    expect(
      suggestChips('crit', [], { types, scopesFor: () => [] }).map(
        (s) => `${s.chip.field}:${s.chip.value}`
      )
    ).toEqual(['alarm:critical']);
  });

  it('matches a type label regardless of spaces, underscores and case, and puts it first', () => {
    const typesById: TypeOption[] = [{ type: 'wind_turbine', label: 'wind_turbine' }];

    expect(
      suggestChips('wind turbine', [], { types: typesById, scopesFor: () => [] }).map(
        (s) => s.chip.field
      )
    ).toEqual(['type']);
    expect(
      suggestChips('WindTurb', [], { types: typesById, scopesFor: () => [] })[0].chip.value
    ).toBe('wind_turbine');
  });

  it('offers the types at least two matching results share, with the count', () => {
    const resultTypes = new Map([
      ['wind_park', 1],
      ['wind_turbine', 6],
    ]);
    const suggestions = suggestChips('nordex', [], { types, scopesFor: () => [], resultTypes });

    expect(suggestions.map((s) => `${s.chip.field}:${s.chip.value}:${s.detail ?? ''}`)).toEqual([
      'type:wind_turbine:6',
    ]);
    // It narrows "nordex" rather than replacing it, so the text survives the chip.
    expect(suggestions[0].remainder).toBe('nordex');
  });

  it('offers nothing for an empty input, and never a chip already applied', () => {
    expect(suggestChips('', [], { types, scopesFor: () => strong(husumPark) })).toEqual([]);
    const applied: QueryChip[] = [{ field: 'in', value: '4711', label: 'Husum' }];

    expect(suggestChips('Husum', applied, { types, scopesFor: () => strong(husumPark) })).toEqual(
      []
    );
  });
});

describe('suggestChips word readings', () => {
  const rostock = result({ id: '600', name: 'Rostock', type: 'energy_site' });
  const scopesFor = (term: string) => rankScopes([husumPark, rostock], term);

  it('reads a later word as a filter and leaves the rest of the search in place', () => {
    const suggestions = suggestChips('nordex rostock', [], { types, scopesFor });

    expect(suggestions.map((s) => `${s.chip.field}:${s.chip.value}:${s.remainder}`)).toEqual([
      'in:600:nordex',
    ]);
  });

  it('reads any word, last first, and the whole text before a single word', () => {
    const suggestions = suggestChips('rostock nordex', [], { types, scopesFor });

    expect(suggestions.map((s) => `${s.chip.value}:${s.remainder}`)).toEqual(['600:nordex']);
    expect(suggestChips('Husum', [], { types, scopesFor })[0].remainder).toBe('');
    // The whole text names the turbine type first; "wind" alone also names the park type, which
    // comes after it and leaves "turbine" (the palette then drops it if nothing matches that).
    expect(
      suggestChips('wind turbine', [], { types, scopesFor: () => [] }).map(
        (s) => `${s.chip.value}:${s.remainder}`
      )
    ).toEqual(['wind_turbine:', 'wind_park:turbine']);
  });

  it('never reads a number or a short word as a place — alone or inside a longer search', () => {
    // Where turbines have sub-assets, every "…4" turbine is a place; reading "4" as one put
    // `In: <turbine>` on the default highlight and Enter added it instead of opening turbine 4.
    const places = [result({ id: '700', name: 'Block 4' }), result({ id: '701', name: 'T4' })];
    const fours = (term: string) => rankScopes(places, term);

    for (const text of ['4', 'T4', 'rostock 4', 'rostock T4']) {
      expect(
        suggestChips(text, [], { types, scopesFor: fours }).filter((s) => s.chip.field === 'in')
      ).toEqual([]);
    }
  });

  it('reads nothing into punctuation', () => {
    for (const text of ['-', '///', 'nordex ///']) {
      expect(suggestChips(text, [], { types, scopesFor: () => [] })).toEqual([]);
    }
  });

  it('marks only what the text plainly names as strong', () => {
    const turbineTypes: TypeOption[] = [{ type: 'wind_turbine', label: 'Wind turbine' }];
    const [wind] = suggestChips('wind', [], { types: turbineTypes, scopesFor: () => [] });

    expect(wind.strong).toBe(true);
    // Contained, not started: offered, but Enter should not add it.
    const [turbine] = suggestChips('turbine', [], { types: turbineTypes, scopesFor: () => [] });

    expect(turbine.strong).toBe(false);
    // Two letters name nothing with confidence.
    expect(suggestChips('cr', [], { types, scopesFor: () => [] })[0].strong).toBe(false);
    expect(suggestChips('crit', [], { types, scopesFor: () => [] })[0].strong).toBe(true);
  });

  it('lets a field value be followed by more search', () => {
    const scopesFor = (term: string) => rankScopes([husumPark], term);
    const [husum] = suggestChips('in:husum nordex', [], { types, scopesFor });

    expect(husum).toEqual(
      jasmine.objectContaining({
        chip: jasmine.objectContaining({ field: 'in', value: '4711' }),
        remainder: 'nordex',
      })
    );
    // A multi-word value still reads whole first.
    const turbineTypes: TypeOption[] = [{ type: 'wind_turbine', label: 'Wind turbine' }];

    expect(
      suggestChips('type:wind turbine', [], { types: turbineTypes, scopesFor })[0].remainder
    ).toBe('');
  });

  it('offers a chip once, from the reading that uses up the most text', () => {
    const suggestions = suggestChips('wind park', [], { types, scopesFor: () => [] });

    expect(suggestions.filter((s) => s.chip.value === 'wind_park').map((s) => s.remainder)).toEqual(
      ['']
    );
  });
});

describe('suggestChips type order', () => {
  it('orders types matched by name by how many current results they keep', () => {
    const resultTypes = new Map([
      ['wind_park', 1],
      ['wind_turbine', 14],
    ]);

    expect(
      suggestChips('wind', [], { types, scopesFor: () => [], resultTypes }).map((s) => s.chip.value)
    ).toEqual(['wind_turbine', 'wind_park']);
  });
});

describe('addChip with nested places', () => {
  const ancestors: Record<string, string[]> = { '600': ['1'], '610': ['1', '600'], '400': ['1'] };
  const ancestorsOf = (id: string) => ancestors[id] ?? [];
  const rostock: QueryChip = { field: 'in', value: '600', label: 'Rostock' };
  const substation: QueryChip = { field: 'in', value: '610', label: 'Rostock Substation' };
  const emden: QueryChip = { field: 'in', value: '400', label: 'Emden' };

  it('replaces the place it drills into, and the other way round', () => {
    // OR'd, Rostock + its substation would still be all of Rostock.
    expect(addChip([rostock], substation, ancestorsOf)).toEqual([substation]);
    expect(addChip([substation], rostock, ancestorsOf)).toEqual([rostock]);
  });

  it('keeps unrelated places side by side, and other fields untouched', () => {
    const type: QueryChip = { field: 'type', value: 'wind_turbine', label: 'Wind turbine' };

    expect(addChip([type, rostock], emden, ancestorsOf)).toEqual([type, rostock, emden]);
  });
});

describe('rankScopes', () => {
  const north = result({ id: '100', name: 'North', ancestorIds: ['1'] });
  const husum = result({ id: '200', name: 'Husum', ancestorIds: ['1', '100'] });
  const substation = result({
    id: '210',
    name: 'Husum Substation',
    ancestorIds: ['1', '100', '200'],
  });
  const pv = result({ id: '220', name: 'PV Subsystem', ancestorIds: ['1', '100', '200'] });
  const northHusum = result({ id: '300', name: 'North-Husum', ancestorIds: ['1'] });
  const emden = result({ id: '400', name: 'Emden', ancestorIds: ['1'] });
  const emdenWind = result({ id: '410', name: 'Wind Subsystem', ancestorIds: ['1', '400'] });
  const husumWind = result({ id: '230', name: 'Wind Subsystem', ancestorIds: ['1', '100', '200'] });
  const all = [pv, substation, northHusum, husum, north, emden, emdenWind, husumWind];

  it('needs the words in the name — no fuzzy look-alikes', () => {
    expect(rankScopes(all, 'Husum').map((r) => r.scope.id)).toEqual(['200', '210', '300']);
  });

  it('ranks exact, then prefix, then word start, then contains', () => {
    const inside = result({ id: '500', name: 'Ahusumb' });

    expect(
      rankScopes([inside, northHusum, substation, husum], 'husum').map((r) => r.scope.id)
    ).toEqual(['200', '210', '300', '500']);
  });

  it('calls exact, prefix and word-start matches strong, a mid-word match not', () => {
    const scored = rankScopes([husum, northHusum, result({ id: '500', name: 'Ahusumb' })], 'husum');

    expect(scored.map((r) => `${r.scope.id}:${r.strong}`)).toEqual([
      '200:true',
      '300:true',
      '500:false',
    ]);
  });

  it('never calls a place outside the applied scope strong', () => {
    expect(rankScopes(all, 'emden', ['200']).map((r) => r.strong)).toEqual([false]);
    expect(rankScopes(all, 'wind', ['200']).map((r) => r.strong)).toEqual([true]);
  });

  it('prefers candidates inside an applied scope, falling back to the rest when none match', () => {
    expect(rankScopes(all, 'wind', ['200']).map((r) => r.scope.id)).toEqual(['230']);
    expect(rankScopes(all, 'emden', ['200']).map((r) => r.scope.id)).toEqual(['400']);
  });

  it('puts the higher-level asset first on a tie', () => {
    expect(rankScopes(all, 'wind subsystem').map((r) => r.scope.id)).toEqual(['410', '230']);
  });
});

describe('toSearchQuery', () => {
  it('groups chips by field and keeps the free text', () => {
    const chips: QueryChip[] = [
      { field: 'in', value: '4711', label: 'Husum' },
      { field: 'type', value: 'wind_turbine', label: 'Wind turbine' },
      { field: 'alarm', value: 'critical', label: 'critical' },
      { field: 'in', value: '4712', label: 'Emden' },
    ];

    expect(toSearchQuery(chips, ' 4 ')).toEqual({
      text: '4',
      scopeIds: ['4711', '4712'],
      typeChips: ['wind_turbine'],
      activeAlarmSeverities: ['critical'],
    });
    expect(toSearchQuery([], '')).toEqual({});
  });

  it('does not add a chip twice', () => {
    const chip: QueryChip = { field: 'type', value: 'wind_park', label: 'Wind park' };

    expect(addChip(addChip([], chip), chip)?.length).toBe(1);
  });
});

/**
 * The two compilers must select the same objects, or switching mode changes the answer.
 */
describe('scope chips, locally and on the platform', () => {
  const corpus: SearchResult[] = [
    husumPark,
    result({ id: '4720', name: 'Husum T4', type: 'wind_turbine', ancestorIds: ['1', '4711'] }),
    result({ id: '4721', name: 'Husum T14', type: 'wind_turbine', ancestorIds: ['1', '4711'] }),
    result({ id: '5020', name: 'Emden T4', type: 'wind_turbine', ancestorIds: ['1', '5000'] }),
    result({ id: '5021', name: 'Controller', type: 'ctrl', isDevice: true, ancestorIds: ['5020'] }),
  ];

  it('scopes to the asset itself and everything below it, OR-ing several', () => {
    expect(SearchCorpusService.filter(corpus, { scopeIds: ['4711'] }).map((r) => r.id)).toEqual([
      '4711',
      '4720',
      '4721',
    ]);
    expect(
      SearchCorpusService.filter(corpus, { scopeIds: ['4711', '5020'] }).map((r) => r.id)
    ).toEqual(['4711', '4720', '4721', '5020', '5021']);
  });

  it('compiles to isinhierarchyof, OR-ing several', () => {
    const compiled = compileToInventoryParams({
      scopeIds: ['4711', '5020'],
      typeChips: ['wind_turbine'],
    });

    expect(compiled.filter).toBe(
      "type eq 'wind_turbine' and (isinhierarchyof(4711) or isinhierarchyof(5020))"
    );
  });

  it('never lets a non-numeric scope id into the filter', () => {
    expect(compileToInventoryParams({ scopeIds: ['1) or (1'] }).filter).toBeUndefined();
  });
});
