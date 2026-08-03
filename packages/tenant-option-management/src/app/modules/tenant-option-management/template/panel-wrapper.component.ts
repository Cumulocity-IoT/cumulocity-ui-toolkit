import { Component } from '@angular/core';
import { FieldWrapper, FormlyModule } from '@ngx-formly/core';

@Component({
  selector: 'formly-wrapper-panel',
  template: `
    <div class="card">
      <h3 class="card-header">{{ props.label }}</h3>
      <div class="card-body m-16">
        <ng-container #fieldComponent></ng-container>
      </div>
    </div>
  `,
  standalone: true,
  imports: [FormlyModule],
})
export class PanelWrapperComponent extends FieldWrapper {}
