import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { C8yTranslatePipe, DateTimePickerModule } from '@c8y/ngx-components';
import { FieldType, FieldTypeConfig, FormlyModule } from '@ngx-formly/core';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';
import { TimepickerModule } from 'ngx-bootstrap/timepicker';

@Component({
  selector: 'formly-time',
  templateUrl: './time.formly.component.html',
  standalone: true,
  imports: [
    DateTimePickerModule,
    FormlyModule,
    BsDatepickerModule,
    C8yTranslatePipe,
    TimepickerModule,
    FormsModule,
  ],
})
export class TimeFieldType extends FieldType<FieldTypeConfig> implements OnInit {
  now = new Date();
  day: Date;
  time: Date;

  get date(): Date {
    return this._date;
  }

  set date(date: Date) {
    this._date = date;
    this.formControl.setValue(date.toISOString());
  }

  private _date: Date;

  ngOnInit(): void {
    const dateTime = this.formControl.value
      ? new Date(this.formControl.value as string)
      : new Date();

    dateTime.setSeconds(0);
    dateTime.setMilliseconds(0);

    this.date = dateTime;
    this.day = dateTime;
    this.time = dateTime;
  }

  setDay(date: Date) {
    const dateTime = this._date.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());

    this.date = new Date(dateTime);
  }

  setTime(date: Date) {
    const dateTime = this._date.setHours(date.getHours(), date.getMinutes(), 0, 0);

    this.date = new Date(dateTime);
  }
}
