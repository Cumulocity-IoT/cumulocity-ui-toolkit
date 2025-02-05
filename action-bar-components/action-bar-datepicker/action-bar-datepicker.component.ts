import { Component, EventEmitter, Input, Output } from '@angular/core';
import { BsDatepickerConfig } from 'ngx-bootstrap/datepicker';
import { CoreModule } from '@c8y/ngx-components';
import { BsDatepickerModule } from "ngx-bootstrap/datepicker";

@Component({
  selector: 'ps-action-bar-datepicker',
  templateUrl: './action-bar-datepicker.component.html',
  standalone: true,
  imports: [CoreModule, BsDatepickerModule],

})
export class ActionBarDatePicker {
  @Input() placement: 'left' | 'right' = 'left';
  @Input() date: Date = new Date();
  @Input() title = '';
  @Input() config: Partial<BsDatepickerConfig> = {};
  @Output() dateChange = new EventEmitter<Date>();

  dateChanged(date: Date) {
    this.dateChange.emit(date);
  }
}
