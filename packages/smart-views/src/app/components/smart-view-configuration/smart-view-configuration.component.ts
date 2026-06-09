import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { InventoryService } from '@c8y/client';
import { Column, CoreModule, DisplayOptions, Pagination } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { SmartViewConfiguration } from '../../smart-views.model';

@Component({
  standalone: true,
  selector: 'app-smart-view-configuration',
  templateUrl: './smart-view-configuration.component.html',
  styleUrls: ['./smart-view-configuration.component.less'],
  imports: [CommonModule, CoreModule],
})
export class SmartViewConfigurationComponent implements OnInit {
  private readonly inventoryService = inject(InventoryService);

  readonly configurations = signal<SmartViewConfiguration[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly labels = {
    title: gettext('Smart views configuration'),
    description: gettext('Manage and configure smart views for your devices.'),
    empty: gettext('No smart view configurations found.'),
  };

  readonly pagination: Pagination = {
    pageSize: 25,
    currentPage: 1,
  };

  readonly displayOptions: DisplayOptions = {
    bordered: true,
    striped: true,
    filter: true,
    gridHeader: true,
    hover: true,
  };

  readonly columns: Column[] = [
    {
      name: 'name',
      header: gettext('Name'),
      path: 'name',
      filterable: true,
      sortable: true,
    },
    {
      name: 'id',
      header: gettext('ID'),
      path: 'id',
      filterable: true,
      sortable: true,
    },
    {
      name: 'icon',
      header: gettext('Icon'),
      path: 'c8y_SmartViewConfiguration.icon',
      filterable: true,
      sortable: true,
    },
    {
      name: 'query',
      header: gettext('Query'),
      path: 'c8y_SmartViewConfiguration.query',
      filterable: true,
      sortable: true,
    },
  ];

  ngOnInit(): void {
    void this.loadConfigurations();
  }

  private async loadConfigurations(): Promise<void> {
    try {
      const { data } = await this.inventoryService.list({
        type: 'c8y_SmartViewConfiguration',
        pageSize: 2000,
        withTotalPages: true,
      });

      this.configurations.set(data as SmartViewConfiguration[]);
    } catch {
      this.errorMessage.set(gettext('Could not load smart view configurations.'));
    } finally {
      this.loading.set(false);
    }
  }
}
