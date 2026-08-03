import { Component } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { FieldType, FieldTypeConfig, FormlyModule } from '@ngx-formly/core';
import { DATE_OPTIONS } from './formly-query-blocks';

@Component({
  selector: 'ps-relative-date-type',
  standalone: true,
  imports: [ReactiveFormsModule, FormlyModule],
  template: `
    <div class="c8y-select-wrapper">
      <select class="form-control" [formControl]="formControl">
        @for (opt of dateOptions; track opt.value) {
          <option [value]="opt.value">{{ opt.label }}</option>
        }
      </select>
    </div>
  `,
})
export class RelativeDateTypeComponent extends FieldType<FieldTypeConfig> {
  readonly dateOptions = DATE_OPTIONS;
}
