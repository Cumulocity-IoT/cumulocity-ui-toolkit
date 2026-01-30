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
  closeSubject: Subject<TenantOptionRow | null> = new Subject();

  option: ITenantOption = {
    key: '',
    category: '',
  };

  isLoading = false;

  private tenantOptionMgmt = inject(TenantOptionManagementService);
  private alert = inject(AlertService);
  private modal = inject(BsModalRef);

  import() {
    this.isLoading = true;
    this.tenantOptionMgmt
      .allowListOption(this.option)
      .then(
        (row) => {
          this.closeSubject.next(row);
          this.modal.hide();
        },
        (error) => {
          this.alert.danger('Option could not be imported', JSON.stringify(error));
        }
      )
      .finally(() => (this.isLoading = false));
  }

  close() {
    this.closeSubject.next(null);
    this.modal.hide();
  }
}
