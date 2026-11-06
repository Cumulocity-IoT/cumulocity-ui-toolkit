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
    const candidates = [result('Pump 7', { type: 'water_pump', keywords: 'E101-SN-01' })];

    for (const term of ['pump', 'water_pump', 'e101sn01', 'E101']) {
      for (const [start, end] of fuzzy.rank(candidates, term)[0]?.highlights ?? []) {
        expect(start).toBeGreaterThanOrEqual(0);
        expect(end).toBeLessThanOrEqual('Pump 7'.length);
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

  it('puts an identifier number before a decimal or a larger number — a model number next to an id', () => {
    const ranked = [
      result('BLPMP07 · Grundfos CR-4.2 kW'),
      result('ROSUB01 · Siemens Energy 40 MVA'),
      result('BLPMP14 · KSB Etanorm 3000'),
      result('Pump 4'),
      result('BLPMP04 · KSB Etanorm 3000'),
    ];

    expect(names(preferNumberIdentity(ranked, '4'))).toEqual([
      'BLPMP04 · KSB Etanorm 3000',
      'Pump 4',
      'BLPMP07 · Grundfos CR-4.2 kW',
      'ROSUB01 · Siemens Energy 40 MVA',
      'BLPMP14 · KSB Etanorm 3000',
    ]);
  });

  it('keeps the fuzzy order within a tier and leaves a term without numbers alone', () => {
    const ranked = [result('T04-Main-Controller'), result('BLPMP04')];

    expect(names(preferNumberIdentity(ranked, '4'))).toEqual(['T04-Main-Controller', 'BLPMP04']);
    expect(preferNumberIdentity(ranked, 'blpmp')).toBe(ranked);
  });

  it('reads separated identifiers and trailing punctuation as identity', () => {
    const ranked = [
      result('Vestas V150-4.2 MW'),
      result('PMP-04'),
      result('Pump 4, north'),
      result('T#4'),
    ];

    expect(names(preferNumberIdentity(ranked, '4'))).toEqual([
      'PMP-04',
      'T#4',
      'Pump 4, north',
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
