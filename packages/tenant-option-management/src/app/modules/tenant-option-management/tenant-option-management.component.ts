import { Component } from '@angular/core';
import {
  ActionControl,
  BuiltInActionType,
  Column,
  ColumnDataType,
  ModalService,
  Pagination,
  Row,
  Status,
  _,
} from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { take } from 'rxjs/operators';
import { BsModalService } from 'ngx-bootstrap/modal';
import { AddOptionModalComponent } from './add-option/add-option-modal.component';
import { TenantOptionManagementService } from './tenant-option-management.service';
import { ImportOptionModalComponent } from './import-option/import-option-modal.component';
import { ExportModalComponent } from './export-modal/export-modal.component';
import { FileImportModalComponent } from './file-import-modal/file-import-modal.component';
import { TenantOptionRow } from './model';

@Component({
  templateUrl: './tenant-option-management.component.html',
  styleUrls: ['./tenant-option-management.component.less'],
  standalone: false,
})
export class TenantOptionManagementComponent {
  columns: Column[];
  rows: (Row | TenantOptionRow)[];

  pagination: Pagination = {
    pageSize: 30,
    currentPage: 1,
  };

  actionControls: ActionControl[] = [
    {
      type: BuiltInActionType.Edit,
      callback: (row: TenantOptionRow) => this.onEditRow(row),
    },
    {
      type: BuiltInActionType.Delete,
      callback: (row: TenantOptionRow) => void this.onDeleteRow(row),
    },
  ];

  isLoading = false;

  constructor(
    private optionsManagement: TenantOptionManagementService,
    private bsModalService: BsModalService,
    protected modal: ModalService,
    protected translateService: TranslateService
  ) {
    this.columns = this.getDefaultColumns();
    void this.reload();
  }

  async reload() {
    this.isLoading = true;

    try {
      const allOptions = this.optionsManagement.getAllOptions();

      const config = await this.optionsManagement.getConfiguration();

      this.rows = config.options.map((o) => ({ id: `${o.category}-${o.key}`, ...o })) as Row[];
      const options = await allOptions;

      for (const r of this.rows) {
        r.value = options.find((o) => o.id === r.id)?.value;
      }
    } catch (e) {
      this.rows = [];
    } finally {
      this.isLoading = false;
    }
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
      {
        header: 'Content',
        name: 'content',
        path: 'value',
        filterable: true,
        dataType: ColumnDataType.TextLong,
      },
      {
        header: 'Last updated',
        name: 'lastUpdated',
        path: 'lastUpdated',
        filterable: true,
        dataType: ColumnDataType.TextShort,
      },
      {
        header: 'Owner',
        name: 'user',
        path: 'user',
        filterable: true,
        dataType: ColumnDataType.TextShort,
      },
    ];
  }

  openAddModal(row?: TenantOptionRow) {
    const modalRef = this.bsModalService.show(AddOptionModalComponent, { class: 'modal-lg' });

    modalRef.content.ids = this.rows.map((r) => r.id);

    if (row) {
      modalRef.content.setOption(row);
    }
    modalRef.content.closeSubject.pipe(take(1)).subscribe((option) => {
      if (option) {
        const index = this.rows.findIndex((r) => r.id === option.id);

        if (index !== -1) {
          this.rows[index] = option;
        } else {
          this.rows.push(option);
        }
        this.rows = [...this.rows]; // trigger binding
      }
    });
  }

  openImportFromFileModal() {
    const modalRef = this.bsModalService.show(FileImportModalComponent, { class: 'modal-lg' });

    modalRef.content.closeSubject.pipe(take(1)).subscribe(() => {
      void this.reload();
    });
  }

  openAllowListModal() {
    const modalRef = this.bsModalService.show(ImportOptionModalComponent, { class: 'modal-lg' });

    modalRef.content.closeSubject.pipe(take(1)).subscribe((row) => {
      if (row) {
        this.rows.push(row);
        this.rows = [...this.rows]; // trigger binding
      }
    });
  }

  openExportModal() {
    const modalRef = this.bsModalService.show(ExportModalComponent, { class: 'modal-lg' });

    modalRef.content.closeSubject.pipe(take(1)).subscribe();
  }

  onEditRow(row: TenantOptionRow): void {
    this.openAddModal(row);
  }

  async onDeleteRow(row: TenantOptionRow) {
    await this.modal.confirm(
      _('Delete Tenant Option') as string,
      this.translateService.instant(
        _(
          `You are about to delete Tenant Option with Category "{{ category }}" and Key "{{ key }}". Do you want to proceed?`
        ) as string,
        { category: row.category, key: row.key }
      ) as string,
      Status.DANGER,
      { ok: _('Delete') as string, cancel: _('Cancel') as string }
    );
    await this.optionsManagement.deleteOption(row);
    this.rows = this.rows.filter((r) => r.category !== row.category || r.key !== row.key);
  }
}
