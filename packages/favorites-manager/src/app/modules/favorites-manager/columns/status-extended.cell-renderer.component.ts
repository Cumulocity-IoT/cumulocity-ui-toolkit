import { Component } from '@angular/core';
import { CellRendererContext, CoreModule } from '@c8y/ngx-components';

@Component({
  standalone: true,
  template: `
    @if (context.item.c8y_IsDevice) {
      <device-status [mo]="context.item"></device-status>
    }
  `,
  imports: [CoreModule],
})
export class StatusExtendedCellRendererComponent {
  constructor(public context: CellRendererContext) {}
}
