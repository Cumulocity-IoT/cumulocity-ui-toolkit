import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionBarFactory, ActionBarItem } from '@c8y/ngx-components';
import { FavoritesActionComponent } from './favorites-action.component';
import { findContextData } from './context-route.helper';

@Injectable()
export class FavoritesActionFactory implements ActionBarFactory {
  private readonly FAVORITES_ACTION: ActionBarItem = {
    priority: 100,
    placement: 'left',
    template: FavoritesActionComponent,
  };

  // `ExtensionFactory.get` is typed `T[] | T` (plus async variants) — an empty
  // array is the documented way to contribute nothing; `undefined` only ever
  // type-checked because strictNullChecks was off.
  get(activatedRoute?: ActivatedRoute): ActionBarItem[] {
    if (!activatedRoute) {
      return [];
    }

    const managedObject = findContextData(activatedRoute.snapshot);

    if (
      !managedObject ||
      (!managedObject.c8y_IsDevice &&
        !managedObject.c8y_IsAsset &&
        !managedObject.c8y_IsDeviceGroup)
    ) {
      return [];
    }

    return [this.FAVORITES_ACTION];
  }
}
