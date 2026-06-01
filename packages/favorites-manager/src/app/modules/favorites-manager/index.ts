import { hookActionBar, hookNavigator, hookRoute } from '@c8y/ngx-components';
import { FavoritesManagerNavigationFactory } from './favorites-manager.factory';
import { FavoritesActionFactory } from './favorites-action.factory';

export const favoritesManagerViewProviders = [
  hookActionBar(FavoritesActionFactory),
  hookNavigator(FavoritesManagerNavigationFactory),
  hookRoute({
    path: 'favorites',
    loadComponent: () =>
      import('./favorites-manager.component').then((m) => m.FavoritesManagerComponent),
  }),
];
