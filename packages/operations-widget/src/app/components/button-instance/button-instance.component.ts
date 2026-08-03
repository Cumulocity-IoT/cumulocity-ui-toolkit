import { Component, EventEmitter, inject, Input, Output, TemplateRef } from '@angular/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { OperationButtonConfig } from '../../models/operations-widget-config.model';
import { CoreModule } from '@c8y/ngx-components';

@Component({
  selector: 'button-instance',
  templateUrl: './button-instance.component.html',
  styleUrls: ['./button-instance.component.scss'],
  standalone: true,
  imports: [CoreModule],
})
export class ButtonInstanceComponent {
  private modalService = inject(BsModalService);

  @Input() config: OperationButtonConfig;
  @Input() preview: boolean = false;
  @Output() clickedOperation = new EventEmitter<OperationButtonConfig>();

  modalRef?: BsModalRef;

  createOperation(event: Event): void {
    event.stopPropagation();

    if (!this.preview) this.clickedOperation.emit(this.config);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  openModal(template: TemplateRef<any>, size: 'modal-lg'): void {
    if (!this.config.showModal) {
      this.clickedOperation.emit(this.config);
    } else {
      this.modalRef = this.modalService.show(template, { class: size });
    }
  }
}
