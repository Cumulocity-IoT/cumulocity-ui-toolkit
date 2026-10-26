import { withLookupBudget } from '../../testing/lookup-budget';
import { buildIndexablePropertyMap } from './asset-definition.model';
import { buildAssetIndex, highlightRanges, searchAssets } from './asset-search';
import { buildHierarchy, type RawManagedObject } from './asset-rollup';

/**
 * The search itself: what matches, in what order, and what gets marked.
 *
 * The ordering assertions are the point of the file. Matching is easy to get roughly
 * right and hard to get *ranked* right — TF-IDF alone happily puts a short-named park
 * above the turbine whose name the user typed in full, and no amount of correct matching
 * makes up for the answer being third.
 */

const asOf = '2026-07-30T12:00:00.000Z';
const LEAF = 'wind_turbine';

function mo(
  id: string,
  children: string[] = [],
  name = id,
  type = 'wind_park',
  extra: Record<string, unknown> = {}
): RawManagedObject {
  return {
    id,
    name,
    type,
    childAssets: { references: children.map((child) => ({ managedObject: { id: child } })) },
    ...extra,
  };
}

/** `Fleet → Emden (park) → Emden T12 / Emden T3`, plus a park nobody is looking for. */
function fleet() {
  return buildHierarchy(
    [
      mo('root', ['emden', 'aurich'], 'Fleet', 'wind_fleet_root'),
      mo('emden', ['t12', 't3'], 'Emden', 'wind_park'),
      mo('aurich', [], 'Aurich', 'wind_park'),
      mo('t12', [], 'Emden T12', LEAF, {
        c8y_Hardware: { serialNumber: 'A-1234', model: 'E-126' },
        c8y_Notes: 'Gearbox replaced in 2025',
      }),
      mo('t3', [], 'Emden T3', LEAF, { c8y_ExternalId: 'ENC-0003' }),
    ],
    asOf
  );
}

const search = (
  hierarchy = fleet(),
  searchText = '',
  options: { matchMode?: 'exact' | 'startsWith' | 'contains'; pinnedIds?: Set<string> } = {}
) =>
  searchAssets(
    buildAssetIndex(hierarchy),
    hierarchy,
    { searchText, matchMode: options.matchMode ?? 'contains' },
    { pinnedIds: options.pinnedIds }
  );

describe('searchAssets — what matches', () => {
  it('requires every term, across fields — "emden t12" finds the one turbine', () => {
    const result = search(fleet(), 'emden t12');

    expect([...(result?.ids ?? [])]).toEqual(['t12']);
  });

  it('matches as you type, before the word is finished', () => {
    const result = search(fleet(), 'auri');

    expect(result?.ids.has('aurich')).toBe(true);
  });

  it('tolerates a typo the literal search cannot see', () => {
    // "Ermden" has an `r` that is in no name, so neither a substring nor a subsequence
    // match can survive it — only an edit distance can.
    const result = search(fleet(), 'Ermden');

    expect(result?.ids.has('emden')).toBe(true);
    expect(result?.fuzzy).toBe(true);
  });

  it('falls back to a subsequence for an abbreviation', () => {
    const hierarchy = buildHierarchy([mo('t', [], 'WTG 12', LEAF)], asOf);
    const result = search(hierarchy, 'wtg12');

    expect(result?.ids.has('t')).toBe(true);
    expect(result?.fuzzy).toBe(true);
  });

  it('matches the middle of a word, which a token index alone cannot', () => {
    // The literal pass exists exactly for this: "mden" is inside the token "emden", so no
    // amount of prefix or fuzzy matching in the index reaches it.
    const result = search(fleet(), 'mden');

    expect(result?.ids.has('emden')).toBe(true);
    expect(result?.fuzzy).toBe(false);
  });

  it('finds an asset by something that is not its name', () => {
    expect(search(fleet(), 'ENC-0003')?.ids.has('t3')).toBe(true); // external id
    expect(search(fleet(), 'gearbox')?.ids.has('t12')).toBe(true); // description
    expect(search(fleet(), 'serial 1234')?.ids.has('t12')).toBe(true); // property + label
    expect(search(fleet(), 'turbine')?.ids.has('t12')).toBe(true); // type label
  });

  it('reports which field answered, so the row can explain itself', () => {
    const result = search(fleet(), 'gearbox');

    expect(result?.matchedFields.get('t12')).toContain('notes');
  });

  it('honours the literal match modes', () => {
    expect(search(fleet(), 'emden', { matchMode: 'exact' })?.ids.has('emden')).toBe(true);
    expect(search(fleet(), 'emden', { matchMode: 'exact' })?.ids.has('t12')).toBe(false);
    expect(search(fleet(), 'emden t', { matchMode: 'startsWith' })?.ids.has('t12')).toBe(true);
    expect(search(fleet(), 'T12', { matchMode: 'startsWith' })?.ids.has('t12')).toBe(false);
  });

  it('treats an empty term as "no search" rather than "no results"', () => {
    expect(search(fleet(), '   ')).toBeNull();
  });
});

describe('searchAssets — the fuzzy budget stays tight', () => {
  /** A park with numbered turbines, where the numbers are one edit apart. */
  function numberedFleet() {
    return buildHierarchy(
      [
        mo('root', ['cux'], 'Fleet', 'wind_fleet_root'),
        mo('cux', ['010', '011', '012', '013', '014', '015'], 'Cuxhaven', 'wind_park'),
        ...['010', '011', '012', '013', '014', '015'].map((n) =>
          mo(n, [], `${n} · Enercon E-101`, LEAF)
        ),
      ],
      asOf
    );
  }

  it('keeps a numeric term exact — "cuxhaven 013" is one turbine, not six', () => {
    // "013" is an identity: every 1-edit neighbour is a *different turbine*, so the
    // primary pass must not spend an edit on it (and must not flag the result fuzzy —
    // both terms matched literally).
    const result = search(numberedFleet(), 'cuxhaven 013');

    expect([...(result?.ids ?? [])]).toEqual(['013']);
    expect(result?.fuzzy).toBe(false);
  });

  it('still finds a transposition, tightly', () => {
    // Two Levenshtein edits — only the widened fourth pass can see it, and it must say so.
    const result = search(fleet(), 'Emedn');

    expect(result?.ids.has('emden')).toBe(true);
    expect(result?.ids.has('aurich')).toBe(false);
    expect(result?.fuzzy).toBe(true);
  });

  it('returns nothing for nonsense instead of loose neighbours', () => {
    expect([...(search(fleet(), 'xyzzy')?.ids ?? [])]).toEqual([]);
  });

  it('gives a 4-character term one edit, not two', () => {
    // At two edits, a term like "auri" pulled back a third of a real fleet. One edit
    // keeps the prefix behaviour ("auri" → "Aurich" via prefix, not via edits) without
    // the trawl.
    const result = search(fleet(), 'auri');

    expect([...(result?.ids ?? [])]).toEqual(['aurich']);
  });
});

describe('searchAssets — ranking', () => {
  it('puts the name the user typed first', () => {
    // "Emden" is also in the path of both turbines and in their names, and the park's own
    // name is the shortest field in the fleet — every reason TF-IDF has to rank something
    // else first.
    expect(search(fleet(), 'Emden')?.order[0]).toBe('emden');
  });

  it('prefers a prefix of the name over a match buried elsewhere', () => {
    const order = search(fleet(), 'Emden T')?.order ?? [];

    expect(order.slice(0, 2).sort()).toEqual(['t12', 't3']);
  });

  it('lifts a bookmarked asset above an equally good stranger', () => {
    const hierarchy = buildHierarchy(
      [mo('a', [], 'Park North', 'wind_park'), mo('b', [], 'Park North', 'wind_park')],
      asOf
    );

    expect(search(hierarchy, 'park north')?.order[0]).toBe('a');
    expect(search(hierarchy, 'park north', { pinnedIds: new Set(['b']) })?.order[0]).toBe('b');
  });

  it('is stable across identical runs, because the grid re-renders every poll', () => {
    const hierarchy = fleet();
    const first = search(hierarchy, 'emden')?.order;
    const second = search(hierarchy, 'emden')?.order;

    expect(first).toEqual(second);
  });
});

describe('highlightRanges', () => {
  it('marks every occurrence of the term, ordered and non-overlapping', () => {
    expect(highlightRanges('Emden Emden', 'emden', [])).toEqual([
      { start: 0, end: 5 },
      { start: 6, end: 11 },
    ]);
  });

  it('marks the word that was close when the term itself is not in the name', () => {
    // The honest rendering of a typo: "Ermden" is nowhere in "North Emden Offshore", so
    // the mark goes on `Emden`, which is why the row is on screen.
    expect(highlightRanges('North Emden Offshore', 'Ermden', ['emden'])).toEqual([
      { start: 6, end: 11 },
    ]);
  });

  it('merges overlapping ranges rather than handing `markSegments` a tangle', () => {
    expect(highlightRanges('Emden', 'emd', ['emden', 'den'])).toEqual([{ start: 0, end: 5 }]);
  });

  it('marks nothing when the name had nothing to do with it', () => {
    // Matched on its type or a property: inventing marks would misstate why it matched.
    expect(highlightRanges('Emden T12', 'gearbox', ['gearbox'])).toEqual([]);
  });
});

describe('search over a broken hierarchy', () => {
  it('terminates on a `childAssets` cycle', () => {
    // `buildHierarchy` reproduces a cycle faithfully (see `asset-rollup.spec.ts`), so both
    // the path walk in `buildAssetIndex` and the ancestor walk behind the ranking meet one
    // in a real tenant. The budget turns "does not terminate" into a named failure instead
    // of a hung runner — these loops are synchronous, so `testTimeout` cannot preempt them.
    const hierarchy = withLookupBudget(
      buildHierarchy([mo('a', ['b'], 'Alpha'), mo('b', ['a'], 'Beta')], asOf)
    );

    expect(() =>
      searchAssets(
        buildAssetIndex(hierarchy),
        hierarchy,
        {
          searchText: 'alpha',
          matchMode: 'contains',
        },
        { currentId: 'a' }
      )
    ).not.toThrow();
  });
});

describe('indexing what the asset definition says an asset is', () => {
  it('indexes a property under its human label, not its fragment key', () => {
    const definitions = buildIndexablePropertyMap(
      [
        {
          identifier: 'wind_turbine',
          composition: {
            allowedProperties: [{ identifier: 'c8y_Hardware', minOccurs: '1' }],
          },
        },
      ],
      [
        {
          identifier: 'c8y_Hardware',
          jsonSchema: {
            title: 'Hardware',
            type: 'object',
            properties: { serialNumber: { type: 'string', title: 'Serial number' } },
          },
        } as never,
      ]
    );
    const hierarchy = fleet();
    const result = searchAssets(buildAssetIndex(hierarchy, definitions), hierarchy, {
      searchText: 'serial number A-1234',
      matchMode: 'contains',
    });

    expect(result?.ids.has('t12')).toBe(true);
  });

  it('still searches properties when DTM knows nothing about the type', () => {
    // A tenant without DTM, or a type with no model: the heuristic fallback has to keep
    // the property search working, or subscribing to DTM would become a prerequisite for
    // search that used to work without it.
    const hierarchy = fleet();
    const result = searchAssets(buildAssetIndex(hierarchy, new Map()), hierarchy, {
      searchText: 'E-126',
      matchMode: 'contains',
    });

    expect(result?.ids.has('t12')).toBe(true);
  });

  it('indexes names only, without guessed properties, when the inventory fallback is off', () => {
    const hierarchy = fleet();
    const index = buildAssetIndex(hierarchy, new Map(), { fallback: false });

    expect(
      searchAssets(index, hierarchy, { searchText: 'E-126', matchMode: 'contains' })?.ids.has('t12')
    ).toBe(false);
    expect(
      searchAssets(index, hierarchy, { searchText: 'Emden T12', matchMode: 'contains' })?.ids.has(
        't12'
      )
    ).toBe(true);
  });
});
