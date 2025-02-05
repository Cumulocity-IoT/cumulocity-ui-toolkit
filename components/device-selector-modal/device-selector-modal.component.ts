import { Component } from '@angular/core';
import { IIdentified } from '@c8y/client';
import { CommonModule, CoreModule } from '@c8y/ngx-components';
import { AssetSelectionChangeEvent, AssetSelectorModule } from '@c8y/ngx-components/assets-navigator';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { Subject } from 'rxjs';

@Component({
  selector: 'device-selector-modal',
  templateUrl: './device-selector-modal.component.html',
  standalone: true,
  imports: [CommonModule, AssetSelectorModule, CoreModule],
})
export class DeviceSelectorModalComponent {
  config = {
    columnHeaders: true,
    groupsSelectable: false,
    groupsOnly: false,
    multi: true,
    required: false,
    search: true,
    showChildDevices: false,
    showFilter: true,
    showUnassignedDevices: true,
    singleColumn: false,
    label: 'Asset selection',
  };
  model?: IIdentified;
  selectedItems: IIdentified[] = [];

  closeSubject: Subject<IIdentified[] | undefined> = new Subject();

  constructor(private modal: BsModalRef) {}

  selectionChanged(event: AssetSelectionChangeEvent) {
    this.selectedItems = event.items as IIdentified[];
  }

  onSubmit(): void {
    this.closeSubject.next(this.selectedItems);
    this.closeSubject.complete();
    this.modal.hide();
  }

  onCancel(): void {
    this.closeSubject.next(undefined);
    this.closeSubject.complete();
    this.modal.hide();
  }
}
