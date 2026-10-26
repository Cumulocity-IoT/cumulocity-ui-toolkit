import { Injectable } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ActionBarItem, ExtensionFactory } from '@c8y/ngx-components';
import { SmartViewExportActionComponent } from './smart-view-export-action.component';

/** Route path that identifies the Smart View detail page. */
const SMART_VIEW_DETAIL_ROUTE = 'smart-views/:id';

/**
 * Adds the "Export CSV" button to the action bar, but only while the user is
 * on the Smart View detail page (`/smart-views/:id`).
 */
@Injectable({ providedIn: 'root' })
export class SmartViewExportActionFactory implements ExtensionFactory<ActionBarItem> {
  get(activatedRoute?: ActivatedRoute): ActionBarItem[] {
    if (!this.isSmartViewDetailRoute(activatedRoute)) {
      return [];
    }

    return [
      {
        priority: 90,
        placement: 'right',
        component: SmartViewExportActionComponent,
      },
    ];
  }

  private isSmartViewDetailRoute(activatedRoute?: ActivatedRoute): boolean {
    let route = activatedRoute?.snapshot;

    while (route) {
      if (route.routeConfig?.path === SMART_VIEW_DETAIL_ROUTE) {
        return true;
      }

      route = route.firstChild ?? undefined;
    }

    return false;
  }
}
