import { Component, OnDestroy, OnInit } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { REMINDER_MAX_COUNTER } from '../../reminder.model';
import { ReminderService } from '../../services/reminder.service';

const ReminderStatus = {
  default: '',
  warning: 'status-warning',
  danger: 'status-danger',
};

@Component({
  selector: 'c8y-reminder-indicator',
  templateUrl: './reminder-indicator.component.html',
  styleUrls: ['./reminder-indicator.component.less'],
})
export class ReminderIndicatorComponent implements OnInit, OnDestroy {
  open = false;
  counter = 0;
  status = ReminderStatus.default;
  maxCounter = REMINDER_MAX_COUNTER;
  tooltipText!: string;

  private subscription = new Subscription();

  constructor(
    private reminderService: ReminderService,
    private translateService: TranslateService
  ) {}

  ngOnInit(): void {
    // use open status from service
    this.subscription.add(
      this.reminderService.open$?.subscribe((open) => {
        this.open = open;
      })
    );

    // use reminder counter from service
    this.subscription.add(
      this.reminderService.reminderCounter$.subscribe((counter) => {
        this.setCounterStatus(counter);
        this.setCounterText();
      })
    );
  }

  ngOnDestroy(): void {
    this.subscription.unsubscribe();
  }

  toggleDrawer(): void {
    this.reminderService.toggleDrawer();
  }

  private setCounterStatus(counter: number): void {
    this.counter = counter;

    if (counter >= this.maxCounter) this.status = ReminderStatus.danger;
    else if (counter >= 1) this.status = ReminderStatus.warning;
    else this.status = ReminderStatus.default;
  }

  private setCounterText(counter = this.counter): void {
    let txt: string;

    switch (counter) {
      case 0:
        txt = 'No reminder is due';
        break;
      case 1:
        txt = 'One reminder is due';
        break;
      default:
        txt = '{{ counter }} reminders are due';
    }

    this.tooltipText = this.translateService.instant(txt, { counter });
  }
}
