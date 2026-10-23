import { FuzzyService, preferNumberIdentity } from './fuzzy.service';
import type { SearchResult } from './search.model';

/**
 * The ranker is a plain class with no Angular dependencies, so it is constructed directly —
 * no `TestBed`, in keeping with this package's "pure modules only" test scope.
 *
 * Each case here is something the **platform cannot do**: its query language has no `like`
 * and no regex, and `text=` matches whole stemmed tokens. Measured on a live tenant, `Rost`
 * and `Rostocl` both return zero rows for an object named `Rostock`.
 */
const fuzzy = new FuzzyService();

function result(name: string, extra: Partial<SearchResult> = {}): SearchResult {
  return {
    id: name,
    name,
    type: '',
    isDevice: false,
    isAsset: true,
    breadcrumb: [],
    keywords: '',
    highlights: [],
    ...extra,
  };
}

describe('FuzzyService.rank', () => {
  it('matches a prefix, which the platform returns nothing for', () => {
    const ranked = fuzzy.rank([result('Rostock'), result('Emden')], 'Rost');

    expect(ranked.map((hit) => hit.name)).toEqual(['Rostock']);
  });

  it('tolerates a transposition — the reason single-error mode has `intraTrn` on', () => {
    const ranked = fuzzy.rank([result('Pump Station'), result('Emden')], 'pmup');

    expect(ranked.map((hit) => hit.name)).toEqual(['Pump Station']);
  });

  it('tolerates a typo in a proper noun', () => {
    const ranked = fuzzy.rank([result('Rostock'), result('Emden')], 'Rostocl');

    expect(ranked.map((hit) => hit.name)).toEqual(['Rostock']);
  });

  it('finds a serial typed without its separators, via the collapsed copy', () => {
    const candidates = [result('001-Main-Controller', { keywords: 'E101-SN-01 Bachmann MC210' })];

    expect(fuzzy.rank(candidates, 'e101sn01')?.length).toBe(1);
  });

  it('matches on a keyword the name does not contain at all', () => {
    const candidates = [result('001-Main-Controller', { keywords: 'Bachmann MC210' })];

    expect(fuzzy.rank(candidates, 'Bachmann')?.length).toBe(1);
  });

  it('never reports a highlight range outside the name, so the synthetic text cannot leak', () => {
    const candidates = [result('Turbine 7', { type: 'wind_turbine', keywords: 'E101-SN-01' })];

    for (const term of ['turbine', 'wind_turbine', 'e101sn01', 'E101']) {
      for (const [start, end] of fuzzy.rank(candidates, term)[0]?.highlights ?? []) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual('Turbine 7'.length);
        expect(start).toBeLessThan(end);
      }
    }
  });

  it('returns the candidates untouched for an empty or whitespace term', () => {
    const candidates = [result('Rostock'), result('Emden')];

    expect(fuzzy.rank(candidates, '')).toEqual(candidates);
    expect(fuzzy.rank(candidates, '   ')).toEqual(candidates);
  });

  it('does not mutate the candidates it was given', () => {
    const candidates = [result('Rostock')];

    fuzzy.rank(candidates, 'Rost');

    expect(candidates[0]?.highlights).toEqual([]);
  });

  it('returns nothing when nothing matches, rather than the whole candidate set', () => {
    expect(fuzzy.rank([result('Rostock')], 'zzzzqqq')).toEqual([]);
  });

  it('handles an empty candidate set', () => {
    expect(fuzzy.rank([], 'anything')).toEqual([]);
  });
});

describe('preferNumberIdentity', () => {
  const names = (results: SearchResult[]) => results.map((r) => r.name);

  it('puts an identifier number before a decimal or a larger number — the windy-dev case', () => {
    const ranked = [
      result('ROWTG07 · Vestas V150-4.2 MW'),
      result('ROSUB01 · Siemens Energy 40 MVA'),
      result('ROWTG14 · Nordex N117/3000'),
      result('Turbine 4'),
      result('ROWTG04 · Nordex N117/3000'),
    ];

    expect(names(preferNumberIdentity(ranked, '4'))).toEqual([
      'ROWTG04 · Nordex N117/3000',
      'Turbine 4',
      'ROWTG07 · Vestas V150-4.2 MW',
      'ROSUB01 · Siemens Energy 40 MVA',
      'ROWTG14 · Nordex N117/3000',
    ]);
  });

  it('keeps the fuzzy order within a tier and leaves a term without numbers alone', () => {
    const ranked = [result('T04-Main-Controller'), result('ROWTG04')];

    expect(names(preferNumberIdentity(ranked, '4'))).toEqual(['T04-Main-Controller', 'ROWTG04']);
    expect(preferNumberIdentity(ranked, 'rowtg')).toBe(ranked);
  });

  it('reads separated identifiers and trailing punctuation as identity', () => {
    const ranked = [
      result('Vestas V150-4.2 MW'),
      result('WTG-04'),
      result('Turbine 4, north'),
      result('T#4'),
    ];

    expect(names(preferNumberIdentity(ranked, '4'))).toEqual([
      'WTG-04',
      'T#4',
      'Turbine 4, north',
      'Vestas V150-4.2 MW',
    ]);
  });

  it('compares long numbers digit by digit', () => {
    const ranked = [result('SN 12345678901234567891'), result('SN 12345678901234567890')];

    expect(names(preferNumberIdentity(ranked, '12345678901234567890'))[0]).toBe(
      'SN 12345678901234567890'
    );
  });

  it('needs every typed number to identify the row', () => {
    const ranked = [result('Park 2 T9'), result('Park 2 T4')];

    expect(names(preferNumberIdentity(ranked, '2 4'))).toEqual(['Park 2 T4', 'Park 2 T9']);
  });
});
