import { Component, inject } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { BsModalService } from 'ngx-bootstrap/modal';
import { CreateSmartViewConfigurationModalComponent } from './create-smart-view-configuration-modal.component';

/**
 * Action-bar button that opens the modal for creating a new smart view
 * configuration. Rendered inside the action bar's `<li>` element, so the
 * selector targets `li` to avoid an extra wrapper node.
 */
@Component({
  standalone: true,
  selector: 'li[appCreateSmartViewConfigurationAction]',
  template: `
    <button
      class="btn btn-link"
      [title]="label"
      [attr.aria-label]="label"
      (click)="openModal()"
      type="button"
    >
      <i c8yIcon="plus-circle"></i>
      {{ label }}
    </button>
  `,
  imports: [CoreModule],
})
export class CreateSmartViewConfigurationActionComponent {
  private readonly modalService = inject(BsModalService);

  readonly label = gettext('Add configuration');

  openModal(): void {
    this.modalService.show(CreateSmartViewConfigurationModalComponent, { class: 'modal-md' });
  }
}
