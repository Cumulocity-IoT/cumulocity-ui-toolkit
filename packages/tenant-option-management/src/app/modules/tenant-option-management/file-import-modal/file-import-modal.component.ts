import { Component, inject } from '@angular/core';
import { ITenantOption, TenantOptionsService } from '@c8y/client';
import {
  AlertService,
  Column,
  ColumnDataType,
  CoreModule,
  DisplayOptions,
  ModalService,
  Pagination,
  Status,
} from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { TranslateService } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { TenantOptionManagementService } from '../tenant-option-management.service';
import { isEmpty } from 'lodash';
import {
  ImportStatusEnum,
  isImportableTenantOption,
  TenantOptionImportRow,
} from '../tenant-option-management.model';

@Component({
  templateUrl: './file-import-modal.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class FileImportModalComponent {
  closeSubject: Subject<(ITenantOption & { encrypted: string }) | null> = new Subject();

  columns: Column[] = [];
  rows: TenantOptionImportRow[] = [];
  selectedItems: TenantOptionImportRow[] = [];

  displayOptions: DisplayOptions = {
    bordered: false,
    gridHeader: true,
    striped: false,
    filter: false,
    hover: false,
  };

  pagination: Pagination = {
    pageSize: 30,
    currentPage: 1,
  };

  selectable = true;

  isLoading = false;

  title = 'Tenant Options Export';

  private modal = inject(BsModalRef);
  private alertService = inject(AlertService);
  private optionsManagement = inject(TenantOptionManagementService);
  private tenantOptionService = inject(TenantOptionsService);
  protected confirmationModal = inject(ModalService);
  protected translateService = inject(TranslateService);
  constructor() {
    this.columns = this.getDefaultColumns();
  }

  getDefaultColumns(): Column[] {
    return [
      {
        header: 'Category',
        name: 'category',
        path: 'category',
        filterable: true,
        dataType: ColumnDataType.TextLong,
      },
      {
        header: 'Key',
        name: 'key',
        path: 'key',
        filterable: true,
        dataType: ColumnDataType.TextLong,
      },
      {
        header: 'Status',
        name: 'status',
        path: 'status',
        filterable: true,
        gridTrackSize: '9em',
        dataType: ColumnDataType.TextShort,
      },
    ];
  }

  onFileSelected(event: Event & { target: HTMLInputElement }) {
    const file = event.target.files?.[0];

    if (file && file.type === 'application/json') {
      const reader = new FileReader();

      reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
          const fileContent = e.target?.result as string;

          const parsed: unknown = JSON.parse(fileContent);

          if (!Array.isArray(parsed)) {
            throw new Error('Expected the file to contain an array of tenant options.');
          }

          const validRows = parsed.filter(isImportableTenantOption);

          if (!validRows.length) {
            throw new Error('The file contains no entries with a category and a key.');
          }

          if (validRows.length < parsed.length) {
            this.alertService.warning(
              this.translateService.instant(
                gettext('{{count}} entries were skipped because they have no category or key.'),
                { count: parsed.length - validRows.length }
              ) as string
            );
          }

          this.rows = validRows.map((r) => ({
            ...r,
            status: ImportStatusEnum.LOADING,
            id: `${r.category}-${r.key}`,
          }));

          for (const row of this.rows) {
            this.tenantOptionService
              .detail({ category: row.category, key: row.key })
              .then((_option) => {
                row.status = ImportStatusEnum.CONFLICT;
              })
              .catch((_error) => {
                row.status = ImportStatusEnum.NEW;
              });
          }
        } catch (error) {
          this.alertService.danger(
            this.translateService.instant(
              gettext('Invalid file content. Please select a valid JSON file.')
            ) as string,
            (error as Error)?.message
          );
        }
      };

      reader.readAsText(file);
    } else {
      this.alertService.danger(
        this.translateService.instant(
          gettext('Invalid file type. Please select a JSON file.')
        ) as string
      );
    }
  }

  async onItemsSelect(selectedItemIds: string[]) {
    if (
      this.rows.filter(
        (r) => r.status === ImportStatusEnum.CONFLICT && selectedItemIds.includes(r.id)
      ).length > 0
    ) {
      await this.confirmationModal
        .confirm(
          gettext('Overwrite Tenant Options') as string,
          gettext(
            'There is an existing tenant option with the same category and key. Do you want to continue an overwrite that one?'
          ) as string,
          Status.DANGER,
          { ok: gettext('Overwrite'), cancel: gettext('Cancel') }
        )
        .then((result) => {
          if (result) {
            this.selectedItems = this.rows.filter((r) => selectedItemIds.includes(r.id));
            this.rows
              .filter(
                (r) => r.status === ImportStatusEnum.CONFLICT && selectedItemIds.includes(r.id)
              )
              .forEach((r) => (r.status = ImportStatusEnum.OVERWRITE));
          } else {
            this.selectedItems = this.rows.filter(
              (r) => r.status === ImportStatusEnum.NEW && selectedItemIds.includes(r.id)
            );
          }
        });
    } else {
      this.selectedItems = this.rows.filter((r) => selectedItemIds.includes(r.id));
    }
  }

  reload() {}

  async import() {
    if (this.selectedItems.length > 0) {
      this.isLoading = true;

      for (const item of this.selectedItems) {
        await this.importOrUpdateItem(item);
      }
      this.isLoading = false;
      this.alertService.success('Tenant options imported successfully.');
      this.close();
    } else {
      this.alertService.danger('Please select at least one item to import.');
    }
  }

  async importOrUpdateItem(item: TenantOptionImportRow) {
    const row = this.rows.find((r) => r.id == item.id);

    if (!isEmpty(row)) {
      if (row.status === ImportStatusEnum.OVERWRITE) {
        row.status = ImportStatusEnum.LOADING;
        const option = {
          key: item.key,
          category: item.category,
          value: item.value ?? '',
        };

        await this.optionsManagement.updateOption(option);

        try {
          await this.optionsManagement.addOptionToConfiguration(option);
        } catch {
          // The option itself was written; failing to also register it in the
          // plugin configuration must not fail the import.
        }
        row.status = ImportStatusEnum.UPDATED;
      } else {
        row.status = ImportStatusEnum.LOADING;
        const option = {
          key: item.key,
          category: item.category,
          value: item.value,
        };

        await this.optionsManagement.addOption(option);
        row.status = ImportStatusEnum.ADDED;
      }
    }
  }

  close() {
    this.closeSubject.next(null);
    this.modal.hide();
  }
}
