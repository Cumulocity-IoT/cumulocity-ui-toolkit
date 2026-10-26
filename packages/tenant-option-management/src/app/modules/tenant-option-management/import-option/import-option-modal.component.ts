import { Component, inject } from '@angular/core';
import { ITenantOption } from '@c8y/client';
import { AlertService, CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';
import { TenantOptionManagementService } from '../tenant-option-management.service';
import { TenantOptionRow } from '../tenant-option-management.model';

@Component({
  templateUrl: './import-option-modal.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class ImportOptionModalComponent {
  closeSubject: Subject<TenantOptionRow[] | null> = new Subject();

  option: ITenantOption = {
    key: '',
    category: '',
  };

  isLoading = false;

  private tenantOptionMgmt = inject(TenantOptionManagementService);
  private alert = inject(AlertService);
  private modal = inject(BsModalRef);
  private translate = inject(TranslateService);

  import() {
    const category = this.option.category.trim();
    const key = this.option.key.trim();
    const bulk = !key.length;

    this.isLoading = true;

    const importPromise = bulk
      ? this.tenantOptionMgmt.allowListOptionsByCategory(category)
      : this.tenantOptionMgmt.allowListOption({ category, key }).then((row) => [row]);

    importPromise
      .then(
        (rows) => {
          if (bulk) {
            this.alert.success(
              rows.length
                ? (this.translate.instant(
                    gettext('{{count}} tenant options of category "{{category}}" were added.'),
                    { count: rows.length, category }
                  ) as string)
                : (this.translate.instant(
                    gettext('All tenant options of category "{{category}}" are already managed.'),
                    { category }
                  ) as string)
            );
          }
          this.closeSubject.next(rows);
          this.modal.hide();
        },
        (error: unknown) => {
          this.alert.danger(
            gettext('Option could not be imported'),
            error instanceof Error ? error.message : JSON.stringify(error)
          );
        }
      )
      .finally(() => (this.isLoading = false));
  }

  close() {
    this.closeSubject.next(null);
    this.modal.hide();
  }
}
