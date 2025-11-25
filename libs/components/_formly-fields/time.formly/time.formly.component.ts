import { Component } from '@angular/core';
import { DateTimePickerModule } from '@c8y/ngx-components';
import { FieldType, FieldTypeConfig } from '@ngx-formly/core';

@Component({
  selector: 'formly-time',
  templateUrl: './time.formly.component.html',
  standalone: true,
  imports: [DateTimePickerModule],
})
export class TimeFieldType extends FieldType<FieldTypeConfig> {}
