import { hookActionBar, hookNavigator, hookRoute } from '@c8y/ngx-components';
import { FavoritesManagerNavigationFactory } from './favorites-manager.factory';
import { FavoritesManagerComponent } from './favorites-manager.component';
import { FavoritesActionFactory } from './favorites-action.factory';

export const favoritesManagerViewProviders = [
  hookActionBar(FavoritesActionFactory),
  hookNavigator(FavoritesManagerNavigationFactory),
  hookRoute({
    path: 'favorites',
    component: FavoritesManagerComponent,
  }),
];
