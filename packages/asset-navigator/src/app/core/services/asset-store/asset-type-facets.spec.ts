import type { AssetDefinition } from '@c8y/ngx-components';
import { toTypeFacets } from './asset-type-facets';

function definition(identifier: string, title?: string, icon?: string): AssetDefinition {
  return {
    identifier,
    ...(title ? { jsonSchema: { title } } : {}),
    ...(icon ? { icon: { name: icon } } : {}),
  };
}

describe('toTypeFacets', () => {
  it('labels a chip with the schema title but keeps the identifier as the matched value', () => {
    const [facet] = toTypeFacets([definition('wind_turbine', 'Wind turbine', 'c8y-wind-turbine')]);

    expect(facet).toEqual({
      type: 'wind_turbine',
      label: 'Wind turbine',
      icon: 'c8y-wind-turbine',
      selected: false,
    });
  });

  it('falls back to the identifier rather than rendering a blank chip', () => {
    expect(toTypeFacets([definition('wind_park')])[0]?.label).toBe('wind_park');
    expect(toTypeFacets([definition('wind_park', '')])[0]?.label).toBe('wind_park');
  });

  it('omits the icon entirely when the catalog has none', () => {
    expect(toTypeFacets([definition('wind_park', 'Park')])[0].icon).toBeUndefined();
  });

  it('sorts by label so the chip row is stable between sessions', () => {
    const facets = toTypeFacets([
      definition('c', 'Turbine'),
      definition('a', 'Area'),
      definition('b', 'Park'),
    ]);

    expect(facets.map((facet) => facet.label)).toEqual(['Area', 'Park', 'Turbine']);
  });

  it('dedupes by identifier, keeping the first definition', () => {
    const facets = toTypeFacets([
      definition('wind_park', 'First'),
      definition('wind_park', 'Second'),
    ]);

    expect(facets?.length).toBe(1);
    expect(facets[0]?.label).toBe('First');
  });

  it('skips definitions without a usable identifier', () => {
    const facets = toTypeFacets([
      definition('', 'Empty'),
      { jsonSchema: { title: 'No identifier' } } as unknown as AssetDefinition,
      definition('wind_park', 'Park'),
    ]);

    expect(facets.map((facet) => facet.type)).toEqual(['wind_park']);
  });

  it('returns nothing for an empty catalog — a tenant without DTM simply gets no chips', () => {
    expect(toTypeFacets([])).toEqual([]);
  });
});
