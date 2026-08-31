import { FavoritesManagerNavigationFactory } from './favorites-manager.factory';

describe('FavoritesManagerNavigationFactory', () => {
  let factory: FavoritesManagerNavigationFactory;

  beforeEach(() => {
    factory = new FavoritesManagerNavigationFactory();
  });

  it('should be created', () => {
    expect(factory).toBeTruthy();
  });

  it('should use the search-in-list icon for the navigation entry', () => {
    const node = factory.get();

    expect(node.icon).toBe('search-in-list');
  });
});
