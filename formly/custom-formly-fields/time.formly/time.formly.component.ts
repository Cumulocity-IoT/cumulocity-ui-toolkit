import { Component } from '@angular/core';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

@Component({
  selector: 'formly-time',
  templateUrl: './time.formly.component.html'
})
export class TimeFieldType extends FieldType<FieldTypeConfig> {}
