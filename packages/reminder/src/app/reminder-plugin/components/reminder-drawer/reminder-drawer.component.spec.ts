import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AlertService, HeaderService } from '@c8y/ngx-components';
import { BsModalService } from 'ngx-bootstrap/modal';
import { BehaviorSubject, EMPTY } from 'rxjs';
import { Reminder, ReminderConfig, ReminderStatus } from '../../models/reminder.model';
import { ReminderService } from '../../services/reminder.service';
import { ReminderDrawerComponent } from './reminder-drawer.component';

describe('ReminderDrawerComponent reminder updates', () => {
  let component: ReminderDrawerComponent;
  let reminders$: BehaviorSubject<Reminder[]>;
  let groupReminders: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    reminders$ = new BehaviorSubject<Reminder[]>([]);
    groupReminders = jest.fn().mockReturnValue([]);

    TestBed.configureTestingModule({
      providers: [
        { provide: AlertService, useValue: {} },
        { provide: HeaderService, useValue: { rightDrawerOpen$: EMPTY } },
        { provide: BsModalService, useValue: {} },
        { provide: Router, useValue: { events: EMPTY } },
        {
          provide: ReminderService,
          useValue: {
            types: [],
            resetFilterConfig: jest.fn(),
            reminders$,
            config$: new BehaviorSubject<ReminderConfig>({}),
            groupReminders,
          },
        },
      ],
    });

    component = TestBed.runInInjectionContext(() => new ReminderDrawerComponent());
  });

  afterEach(() => {
    component.ngOnDestroy();
    jest.useRealTimers();
  });

  it('digests only the latest reminder state in a one-second window', () => {
    const first = [{ id: '1', status: ReminderStatus.active } as Reminder];
    const latest = [{ id: '2', status: ReminderStatus.active } as Reminder];

    reminders$.next(first);
    jest.advanceTimersByTime(500);
    reminders$.next(latest);
    expect(groupReminders).not.toHaveBeenCalled();

    jest.advanceTimersByTime(500);
    expect(groupReminders).toHaveBeenCalledTimes(1);
    expect(groupReminders).toHaveBeenLastCalledWith(latest, undefined);
    expect(component.reminders).toBe(latest);
  });

  it('skips unchanged content and processes edits to the same array', () => {
    const reminders = [{ id: '1', status: ReminderStatus.active } as Reminder];

    reminders$.next(reminders);
    jest.advanceTimersByTime(1000);
    expect(groupReminders).toHaveBeenCalledTimes(1);

    reminders[0].changed = true;
    reminders$.next(reminders);
    jest.advanceTimersByTime(1000);
    reminders$.next([{ ...reminders[0] }]);
    jest.advanceTimersByTime(1000);
    expect(groupReminders).toHaveBeenCalledTimes(1);

    reminders[0].status = ReminderStatus.cleared;
    reminders$.next(reminders);
    jest.advanceTimersByTime(1000);
    expect(groupReminders).toHaveBeenCalledTimes(2);
  });
});
