import { Component, OnInit } from '@angular/core';
import { CellRendererContext } from '@c8y/ngx-components';
import { IManagedObjectExtended } from '../favorites-manager.model';

@Component({
  template: `
    @if (objectType) {
      <span class="label label-info" [title]="objectType">{{ objectType | translate }}</span>
    }
  `,
})
export class ObjectTypeCellRendererComponent implements OnInit {
  objectType: string;

  constructor(public context: CellRendererContext) {}

  ngOnInit() {
    if (!this.context.item) {
      throw new Error('Missing context item');
    }

    this.initObjectType(this.context.item as IManagedObjectExtended);
  }

  private initObjectType(managedObject: IManagedObjectExtended): void {
    if (managedObject.c8y_IsDevice) {
      this.objectType = 'Device';
    } else if (managedObject.c8y_IsAsset) {
      this.objectType = 'Asset';
    } else if (managedObject.c8y_IsDeviceGroup) {
      this.objectType = 'Group';
    }
  }
}
