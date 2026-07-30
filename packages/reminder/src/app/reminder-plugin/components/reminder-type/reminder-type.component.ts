import { Component, inject, Input, input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { Reminder, ReminderType } from '../../models/reminder.model';
import { ReminderService } from '../../services/reminder.service';

@Component({
  selector: 'c8y-reminder-type',
  templateUrl: './reminder-type.component.html',
  styleUrl: './reminder-type.component.less',
  standalone: true,
  imports: [CoreModule],
})
export class ReminderTypeComponent {
  private reminderService = inject(ReminderService);

  readonly reminder = input<Reminder | undefined>();
  readonly id = input<ReminderType['id'] | undefined>();

  type?: ReminderType;

  constructor() {
    effect(() => {
      const id = this.id() ?? this.reminder()?.reminderType;

      if (id == null) {
        this.type = undefined;

        return;
      }

      this.type = {
        id,
        name: this.reminderService.getReminderTypeName(id),
      };
    });
  }
}
