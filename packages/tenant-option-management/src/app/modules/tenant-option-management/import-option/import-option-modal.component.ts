import { Component, inject } from '@angular/core';
import { ITenantOption } from '@c8y/client';
import { AlertService, CoreModule } from '@c8y/ngx-components';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { TenantOptionManagementService } from '../tenant-option-management.service';
import { TenantOptionRow } from '../model';

@Component({
  templateUrl: './import-option-modal.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class ImportOptionModalComponent {
  /** Emits the imported row(s), or null on cancel. */
  closeSubject: Subject<TenantOptionRow | TenantOptionRow[] | null> = new Subject();

  option: ITenantOption = {
    key: '',
    category: '',
  };

  isLoading = false;

  private tenantOptionMgmt = inject(TenantOptionManagementService);
  private alert = inject(AlertService);
  private modal = inject(BsModalRef);

  get isImportAllMode(): boolean {
    return !!this.option.category && !this.option.key;
  }

  import() {
    this.isLoading = true;

    const importPromise = this.isImportAllMode
      ? this.tenantOptionMgmt.allowListCategory(this.option.category)
      : this.tenantOptionMgmt.allowListOption(this.option);

    importPromise
      .then(
        (result: TenantOptionRow | TenantOptionRow[]) => {
          this.closeSubject.next(result);
          this.modal.hide();
        },
        (error: unknown) => {
          const msg = error instanceof Error ? error.message : JSON.stringify(error);

          this.alert.danger('Option could not be imported', msg);
        }
      )
      .finally(() => (this.isLoading = false));
  }

  close() {
    this.closeSubject.next(null);
    this.modal.hide();
  }
}
