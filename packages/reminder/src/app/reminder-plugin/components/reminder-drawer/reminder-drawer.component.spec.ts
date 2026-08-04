import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AlertService, HeaderService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { EMPTY, Subject } from 'rxjs';
import { provideMock } from '~helpers/auto-mock.helper';
import { Reminder, ReminderConfig } from '../../models/reminder.model';
import { ReminderService } from '../../services/reminder.service';
import { ReminderDrawerComponent } from './reminder-drawer.component';

describe('ReminderDrawerComponent', () => {
  let component: ReminderDrawerComponent;
  let fixture: ReturnType<typeof TestBed.createComponent<ReminderDrawerComponent>>;
  let reminders: ReturnType<typeof signal<Reminder[]>>;
  let config: ReturnType<typeof signal<ReminderConfig>>;
  let groupReminders: jasmine.Spy;

  beforeEach(() => {
    reminders = signal<Reminder[]>([]);
    config = signal<ReminderConfig>({});
    groupReminders = jasmine.createSpy('groupReminders').and.returnValue([]);

    const reminderService = {
      reminders,
      config,
      types: [],
      groupReminders,
      resetFilterConfig: jasmine.createSpy('resetFilterConfig'),
      setConfig: jasmine.createSpy('setConfig'),
    } as unknown as ReminderService;

    TestBed.configureTestingModule({
      imports: [ReminderDrawerComponent],
      providers: [
        { provide: ReminderService, useValue: reminderService },
        { provide: HeaderService, useValue: { rightDrawerOpen$: EMPTY } },
        { provide: Router, useValue: { events: new Subject() } },
        provideMock(AlertService),
        provideMock(BsModalService),
        provideMock(TranslateService),
      ],
    }).overrideComponent(ReminderDrawerComponent, {
      // Strip the heavy module imports; this spec only exercises component state.
      set: { imports: [], template: '' },
    });

    fixture = TestBed.createComponent(ReminderDrawerComponent);
    component = fixture.componentInstance;
  });

  it('is created with the drawer closed', () => {
    expect(component).toBeTruthy();
    expect(component.open()).toBeFalse();
  });

  /**
   * The reminders/config effects are registered from the constructor, which is the
   * only place an injection context is available — moving them to a lifecycle hook
   * would throw NG0203 at runtime, and no other spec covers this component.
   */
  it('registers its service effects in a valid injection context', () => {
    fixture.detectChanges();

    expect(groupReminders).toHaveBeenCalled();
  });

  it('reports the state set through toggleDrawer', () => {
    expect(component.toggleDrawer(true)).toBeTrue();
    expect(component.open()).toBeTrue();

    expect(component.toggleDrawer()).toBeFalse();
    expect(component.open()).toBeFalse();
  });

  it('emits openChange so the service can mirror the drawer state', () => {
    const seen: boolean[] = [];

    component.openChange.subscribe((open) => seen.push(open));

    component.toggleDrawer(true);
    component.toggleDrawer(false);

    expect(seen).toEqual([true, false]);
  });
});
