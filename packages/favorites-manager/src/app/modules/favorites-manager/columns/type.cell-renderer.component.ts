import { Component } from '@angular/core';
import { CellRendererContext } from '@c8y/ngx-components';

@Component({
  standalone: true,
  template: `
    @if (context.value) {
      <span class="label label-info" [title]="context.value">{{ context.value }}</span>
    }
  `,
})
export class TypeCellRendererComponent {
  constructor(public context: CellRendererContext) {}
}
