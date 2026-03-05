import { Injectable } from '@angular/core';
import { InventoryService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { has } from 'lodash';

interface DashboardChild {
  config: unknown;
  [key: string]: unknown;
}

interface C8yDashboard {
  children: Record<string, DashboardChild>;
  [key: string]: unknown;
}

@Injectable()
export class WidgetConfigurationService {
  constructor(
    private inventoryService: InventoryService,
    private alertService: AlertService
  ) {}

  async updateWidgetConfiguration(dashboardId: string, widgetId: string, newConfig: unknown) {
    const { data: mo } = await this.inventoryService.detail(dashboardId);
    const dashboard = mo['c8y_Dashboard'] as C8yDashboard;

    if (!has(dashboard.children, widgetId)) {
      throw new Error(widgetId + ' doesn not exist in Dashboard ' + dashboardId);
    }
    dashboard.children[widgetId].config = newConfig;

    await this.inventoryService
      .update({
        id: dashboardId,
        c8y_Dashboard: dashboard,
      })
      .catch((error) => this.alertService.addServerFailure(error));
  }

  getWidgetConfiguration(dashboardId: string, widgetId: string): Promise<unknown> {
    return this.inventoryService.detail(dashboardId).then((res) => {
      const dashboard = res.data['c8y_Dashboard'] as C8yDashboard;

      if (!has(dashboard.children, widgetId)) {
        throw new Error(widgetId + ' doesn not exist in Dashboard ' + dashboardId);
      }

      return dashboard.children[widgetId].config;
    });
  }
}
