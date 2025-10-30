import { inject, Injectable } from '@angular/core';
import { NavigatorNode, NavigatorNodeFactory } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';

@Injectable()
export class FavoritesManagerNavigationFactory implements NavigatorNodeFactory {
  private FAVORITES_LIST_NAVIGATOR_NODE: NavigatorNode;

  private translateService = inject(TranslateService);

  constructor() {
    this.FAVORITES_LIST_NAVIGATOR_NODE = new NavigatorNode({
      label: this.translateService.instant('favorites.title') as string,
      path: '/favorites',
      icon: 'mark-as-favorite',
      priority: 2000,
    });
  }

  get() {
    return this.FAVORITES_LIST_NAVIGATOR_NODE;
  }
}
