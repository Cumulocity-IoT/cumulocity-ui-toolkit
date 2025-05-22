import { inject, Injectable } from '@angular/core';
import { InventoryService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { has } from 'lodash';
import { Config, Dashboard } from '../helper/dashboard.model';

@Injectable()
export class WidgetConfigurationService {
  private inventoryService = inject(InventoryService);

  private alertService = inject(AlertService);

  async updateWidgetConfiguration(dashboardId: string, widgetId: string, newConfig: Config) {
    const { data: mo } = await this.inventoryService.detail(dashboardId);
    const dashboard = mo['c8y_Dashboard'] as Dashboard;

    if (!has(dashboard.children, widgetId)) {
      throw new Error(widgetId + ' doesn not exist in Dashboard ' + dashboardId);
    }
    dashboard.children[widgetId].config = newConfig;

    this.inventoryService
      .update({
        id: dashboardId,
        c8y_Dashboard: dashboard,
      })
      .catch((error) => this.alertService.addServerFailure(error));
  }

  async getWidgetConfiguration(dashboardId: string, widgetId: string) {
    await this.inventoryService.detail(dashboardId).then((res) => {
      const dashboard = res.data['c8y_Dashboard'] as Dashboard;

      if (!has(dashboard.children, widgetId)) {
        throw new Error(widgetId + ' doesn not exist in Dashboard ' + dashboardId);
      }

      return dashboard.children[widgetId].config;
    });
  }
}
