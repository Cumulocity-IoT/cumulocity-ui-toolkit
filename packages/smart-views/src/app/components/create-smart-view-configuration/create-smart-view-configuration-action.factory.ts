import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionBarItem, ExtensionFactory } from '@c8y/ngx-components';
import { CreateSmartViewConfigurationActionComponent } from './create-smart-view-configuration-action.component';

/** Route on which the "Add configuration" action should be displayed. */
const CONFIGURATION_ROUTE = 'smart-views-configuration';

/**
 * Adds the "Add configuration" action to the action bar, but only while the
 * user is on the smart views configuration page.
 */
@Injectable({ providedIn: 'root' })
export class CreateSmartViewConfigurationActionFactory implements ExtensionFactory<ActionBarItem> {
  get(activatedRoute?: ActivatedRoute): ActionBarItem[] {
    if (!this.isConfigurationRoute(activatedRoute)) {
      return [];
    }

    return [
      {
        priority: 100,
        placement: 'right',
        component: CreateSmartViewConfigurationActionComponent,
      },
    ];
  }

  private isConfigurationRoute(activatedRoute?: ActivatedRoute): boolean {
    let route = activatedRoute?.snapshot;

    while (route) {
      if (route.routeConfig?.path === CONFIGURATION_ROUTE) {
        return true;
      }
      route = route.firstChild ?? undefined;
    }

    return false;
  }
}
