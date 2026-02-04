import { Component, inject, Input } from '@angular/core';
import { Reminder, ReminderType } from '../../models/reminder.model';
import { ReminderService } from '../../services/reminder.service';

@Component({
  selector: 'c8y-reminder-type',
  templateUrl: './reminder-type.component.html',
  styleUrl: './reminder-type.component.less',
  standalone: false,
})
export class ReminderTypeComponent {
  private reminderService = inject(ReminderService);

  @Input() set reminder(reminder: Reminder) {
    this.setType(reminder.reminderType);
  }

  @Input() set id(reminderTypeID: ReminderType['id']) {
    this.setType(reminderTypeID);
  }

  type: ReminderType;

  private setType(id: ReminderType['id']) {
    this.type = {
      id,
      name: this.reminderService.getReminderTypeName(id),
    };
  }
}
