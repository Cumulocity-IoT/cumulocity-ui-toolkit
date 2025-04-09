import { Component } from '@angular/core';
import { CellRendererContext } from '@c8y/ngx-components';

@Component({
  template: `
    @if (context.item.c8y_IsDevice) {
      <device-status [mo]="context.item"></device-status>
    }
  `,
})
export class StatusExtendedCellRendererComponent {
  constructor(public context: CellRendererContext) {}
}
