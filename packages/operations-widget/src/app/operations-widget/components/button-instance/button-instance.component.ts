import { Component, EventEmitter, inject, Input, Output, TemplateRef } from '@angular/core';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { OperationButtonConfig } from '../../models/operations-widget-config.model';

@Component({
  selector: 'app-button-instance',
  templateUrl: './button-instance.component.html',
  styleUrls: ['./button-instance.component.scss'],
})
export class ButtonInstanceComponent {
  private modalService = inject(BsModalService);

  @Input() config: OperationButtonConfig;
  @Output() clickedOperation = new EventEmitter<OperationButtonConfig>();

  modalRef?: BsModalRef;

  createOperation(event: Event): void {
    event.stopPropagation();
    this.clickedOperation.emit(this.config);
  }

  openModal(template: TemplateRef<any>, size: 'modal-lg'): void {
    if (!this.config.showModal) {
      this.clickedOperation.emit(this.config);
    } else {
      this.modalRef = this.modalService.show(template, { class: size });
    }
  }
}
