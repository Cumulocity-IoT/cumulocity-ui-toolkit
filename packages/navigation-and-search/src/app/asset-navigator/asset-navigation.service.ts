import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ViewContext } from '@c8y/ngx-components';
import type { AssetNode } from '../core/services/asset-store/asset-store.model';

/**
 * Where activating a tree row goes. One place, so the drawer, the overlay and the
 * detail panel's `Open` button can never disagree — and so `Alt`+`Enter` /
 * middle-click open the same URL in a tab that a click would have navigated to.
 */
@Injectable({ providedIn: 'root' })
export class AssetNavigationService {
  private readonly router = inject(Router);

  /**
   * Every asset carries `c8y_IsAsset` + `c8y_IsDeviceGroup`, so the group context
   * route is right for all of them, turbines included. A node that is a plain device
   * (a controller, an RTU) uses the device route.
   */
  routeFor(node: AssetNode): string {
    const properties = node.properties as Record<string, unknown>;
    const isPureDevice =
      'c8y_IsDevice' in properties &&
      !('c8y_IsAsset' in properties) &&
      !('c8y_IsDeviceGroup' in properties);
    return isPureDevice
      ? `/${ViewContext.Device.replace(':id', node.id)}`
      : `/${ViewContext.Group.replace(':id', node.id)}`;
  }

  /**
   * `view` names a tab of the asset's page — the detail panel's `Alarms` action asks for
   * one. It is appended to the context route (`…/group/<id>/alarms`), which is how the
   * shell routes an asset's tabs, and it honours `newTab` like any other activation: an
   * `Alt`-click on `Alarms` has to land on the alarms tab in the new tab, not on the
   * asset's default view.
   */
  async open(node: AssetNode, newTab = false, view?: 'alarms'): Promise<void> {
    const route = view ? `${this.routeFor(node)}/${view}` : this.routeFor(node);

    if (newTab) {
      // The shell is a hash-routed app, so a new tab needs the full document URL —
      // `router.serializeUrl` alone would drop the application path.
      window.open(`${location.pathname}#${route}`, '_blank', 'noopener');

      return;
    }
    await this.router.navigateByUrl(route);
  }
}
