import { Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { Subscription } from 'rxjs';
import { REMINDER__COUNTER_DISPLAY_THRESHOLD } from '../../models/reminder.model';
import { ReminderService } from '../../services/reminder.service';

const ReminderStatus = {
  default: '',
  warning: 'status-warning',
  danger: 'status-danger',
};

@Component({
  selector: 'c8y-reminder-indicator',
  templateUrl: './reminder-indicator.component.html',
  styleUrl: './reminder-indicator.component.less',
  standalone: false,
  // changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReminderIndicatorComponent implements OnInit, OnDestroy {
  private reminderService = inject(ReminderService);
  private translateService = inject(TranslateService);

  readonly maxCounter = REMINDER__COUNTER_DISPLAY_THRESHOLD;

  open = signal<boolean>(false);
  counter = signal<number>(0);
  status = ReminderStatus.default;
  tooltipText!: string;

  private subscription = new Subscription();

  ngOnInit(): void {
    // use open status from service
    this.subscription.add(
      this.reminderService.open$.subscribe((open) => {
        this.open.set(open);
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
    this.counter.set(counter);

    if (counter >= this.maxCounter) this.status = ReminderStatus.danger;
    else if (counter >= 1) this.status = ReminderStatus.warning;
    else this.status = ReminderStatus.default;
  }

  private setCounterText(counter = this.counter()): void {
    let txt: string;

    switch (counter) {
      case 0:
        txt = 'reminder.counter.none';
        break;
      case 1:
        txt = 'reminder.counter.one';
        break;
      default:
        txt = 'reminder.counter.multiple';
    }

    this.tooltipText = this.translateService.instant(txt, { counter }) as string;
  }
}
