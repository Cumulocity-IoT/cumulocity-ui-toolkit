import { Injectable } from '@angular/core';
import { NavigatorNode, NavigatorNodeFactory } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';

@Injectable()
export class FavoritesManagerNavigationFactory implements NavigatorNodeFactory {
  private FAVORITES_LIST_NAVIGATOR_NODE: NavigatorNode;

  constructor() {
    this.FAVORITES_LIST_NAVIGATOR_NODE = new NavigatorNode({
      label: gettext('favorites.title'),
      path: '/favorites',
      icon: 'search-in-list',
      priority: 2000,
    });
  }

  get() {
    return this.FAVORITES_LIST_NAVIGATOR_NODE;
  }
}
