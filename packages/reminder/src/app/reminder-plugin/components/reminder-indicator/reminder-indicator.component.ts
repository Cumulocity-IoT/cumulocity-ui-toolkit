import { Component, computed, inject } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { TranslateService } from '@ngx-translate/core';
import { REMINDER__COUNTER_DISPLAY_THRESHOLD } from '../../models/reminder.model';
import { ReminderService } from '../../services/reminder.service';

/** CSS modifier applied to the indicator for a given due-reminder count. */
const INDICATOR_STATUS_CLASS = {
  default: '',
  warning: 'status-warning',
  danger: 'status-danger',
};

@Component({
  selector: 'c8y-reminder-indicator',
  templateUrl: './reminder-indicator.component.html',
  styleUrls: ['./reminder-indicator.component.less'],
  standalone: true,
  imports: [CoreModule, TooltipModule],
})
export class ReminderIndicatorComponent {
  private reminderService = inject(ReminderService);
  private translateService = inject(TranslateService);

  readonly maxCounter = REMINDER__COUNTER_DISPLAY_THRESHOLD;

  // Everything here derives from the service signals, so there is no local state
  // to keep in sync and nothing to subscribe to or tear down.
  readonly open = this.reminderService.open;
  readonly counter = this.reminderService.reminderCounter;

  readonly status = computed(() => {
    const counter = this.counter();

    if (counter >= this.maxCounter) return INDICATOR_STATUS_CLASS.danger;
    if (counter >= 1) return INDICATOR_STATUS_CLASS.warning;

    return INDICATOR_STATUS_CLASS.default;
  });

  readonly tooltipText = computed(() => {
    const counter = this.counter();
    const key =
      counter === 0
        ? 'reminder.counter.none'
        : counter === 1
          ? 'reminder.counter.one'
          : 'reminder.counter.multiple';

    return this.translateService.instant(key, { counter }) as string;
  });

  toggleDrawer(): void {
    this.reminderService.toggleDrawer();
  }
}
