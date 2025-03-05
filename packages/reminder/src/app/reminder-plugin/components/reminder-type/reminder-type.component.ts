import { Component, Input } from '@angular/core';
import { Reminder, ReminderType } from '../../reminder.model';
import { ReminderService } from '../../services';

@Component({
  selector: 'c8y-reminder-type',
  templateUrl: './reminder-type.component.html',
  styleUrl: './reminder-type.component.less',
})
export class ReminderTypeComponent {
  @Input() set reminder(reminder: Reminder) {
    this.setType(reminder.reminderType);
  }

  @Input() set id(reminderTypeID: ReminderType['id']) {
    this.setType(reminderTypeID);
  }

  type: ReminderType;

  constructor(private reminderService: ReminderService) {}

  private setType(id: ReminderType['id']) {
    this.type = {
      id,
      name: this.reminderService.getReminderTypeName(id),
    };
  }
}
