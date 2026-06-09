import { inject, Injectable } from '@angular/core';
import { InventoryService } from '@c8y/client';
import { NavigatorNode, NavigatorNodeFactory } from '@c8y/ngx-components';
import { SmartViewConfiguration } from '../../smart-views.model';

@Injectable()
export class SmartViewFactory implements NavigatorNodeFactory {
  private inventoryService = inject(InventoryService);

  async get() {
    const smartViewNavigatorNodes: NavigatorNode[] = [];

    const smartViewConfigurations = (
      await this.inventoryService.list({ type: 'c8y_SmartViewConfiguration' })
    ).data as SmartViewConfiguration[];

    if (!smartViewConfigurations || smartViewConfigurations.length === 0) {
      return smartViewNavigatorNodes;
    }

    smartViewConfigurations.forEach((config) => {
      smartViewNavigatorNodes.push({
        label: config.name,
        path: `smart-views/${config.id}`,
        icon: config.c8y_SmartViewConfiguration.icon,
        priority: 100,
      } as NavigatorNode);
    });

    return smartViewNavigatorNodes;
  }
}
