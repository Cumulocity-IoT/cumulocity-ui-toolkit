import { Component, input, model } from '@angular/core';
import { BsDatepickerConfig } from 'ngx-bootstrap/datepicker';
import { CoreModule } from '@c8y/ngx-components';
import { BsDatepickerModule } from 'ngx-bootstrap/datepicker';

@Component({
  selector: 'ps-action-bar-datepicker',
  templateUrl: './action-bar-datepicker.component.html',
  standalone: true,
  imports: [CoreModule, BsDatepickerModule],
})
export class ActionBarDatePicker {
  placement = input<'left' | 'right'>('left');
  date = model<Date>(new Date());
  title = input('');
  config = input<Partial<BsDatepickerConfig>>({});

  dateChanged(date: Date) {
    this.date.set(date);
  }
}
