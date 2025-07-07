import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionBarFactory, ActionBarItem } from '@c8y/ngx-components';
import { FavoritesActionComponent } from './favorites-action.component';
import { IManagedObjectExtended } from './favorites-manager.model';

@Injectable()
export class FavoritesActionFactory implements ActionBarFactory {
  private readonly FAVORITES_ACTION: ActionBarItem = {
    priority: 100,
    placement: 'left',
    template: FavoritesActionComponent,
  };

  get(activatedRoute?: ActivatedRoute) {
    if (!activatedRoute) {
      return undefined;
    }

    const managedObject = activatedRoute.parent?.snapshot?.data
      .contextData as IManagedObjectExtended;

    if (
      !managedObject ||
      (!managedObject.c8y_IsDevice &&
        !managedObject.c8y_IsAsset &&
        !managedObject.c8y_IsDeviceGroup)
    ) {
      return undefined;
    }

    return this.FAVORITES_ACTION;
  }
}
