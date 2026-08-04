import { Component, inject } from '@angular/core';
import { ITenantOption } from '@c8y/client';
import {
  AlertService,
  Column,
  ColumnDataType,
  CoreModule,
  DisplayOptions,
  Pagination,
} from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { TenantOptionManagementService } from '../tenant-option-management.service';
import { TenantOptionConfigurationItem } from '../tenant-option-management.model';

@Component({
  templateUrl: './export-modal.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class ExportModalComponent {
  closeSubject: Subject<(ITenantOption & { encrypted: string }) | null> = new Subject();

  columns: Column[] = [];
  rows: (TenantOptionConfigurationItem & { id: string })[] = [];
  selectedItems: (TenantOptionConfigurationItem & { id: string })[] = [];

  displayOptions: DisplayOptions = {
    bordered: false,
    gridHeader: true,
    striped: false,
    filter: false,
    hover: false,
  };

  pagination: Pagination = {
    pageSize: 50,
    currentPage: 1,
  };

  selectable = true;

  isLoading = false;

  title = 'Tenant Options Export';

  private optionsManagement = inject(TenantOptionManagementService);
  private modal = inject(BsModalRef);
  private alertService = inject(AlertService);
  private translateService = inject(TranslateService);

  constructor() {
    this.columns = this.getDefaultColumns();
    this.reload();
  }

  getDefaultColumns(): Column[] {
    return [
      {
        header: 'Category',
        name: 'category',
        path: 'category',
        filterable: true,
        dataType: ColumnDataType.TextShort,
      },
      {
        header: 'Key',
        name: 'key',
        path: 'key',
        filterable: true,
        dataType: ColumnDataType.TextShort,
      },
    ];
  }

  onItemsSelect(selectedItemIds: string[]) {
    this.selectedItems = this.rows.filter((r) => selectedItemIds.includes(r.id));
  }

  reload() {
    void this.optionsManagement.getConfiguration().then(
      (config) =>
        (this.rows = config.options.map((o) => ({
          id: `${o.category}-${o.key}`,
          category: o.category,
          key: o.key,
        }))),
      () => (this.rows = [])
    );
  }

  async export() {
    this.isLoading = true;

    try {
      const all = await this.optionsManagement.getAllOptions();
      const items: ITenantOption[] = [];

      for (const selected of this.selectedItems) {
        const found = all.find((o) => o.id === selected.id);

        if (found) {
          items.push({
            category: selected.category,
            key: selected.key,
            value: found.value,
          });
        }
      }

      const selectedItemsJson = JSON.stringify(items);
      const blob = new Blob([selectedItemsJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      try {
        link.href = url;
        link.download = 'export_tenant_options.json';
        link.click();
      } finally {
        // The object URL pins the blob in memory until it is revoked.
        URL.revokeObjectURL(url);
      }

      this.isLoading = false;
      this.close();
    } catch (e) {
      // Keep the modal open on failure so the user can retry — closing it
      // silently looks like a successful export.
      this.isLoading = false;
      this.alertService.danger(
        this.translateService.instant(gettext('Could not export the tenant options.')) as string,
        e as string
      );
    }
  }

  close() {
    this.closeSubject.next(null);
    this.modal.hide();
  }
}
