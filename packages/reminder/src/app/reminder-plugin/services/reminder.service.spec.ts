import { TestBed } from '@angular/core/testing';
import { EventService, IResult, TenantOptionsService } from '@c8y/client';
import { AlertService, EventRealtimeService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { provideMock } from '~helpers/auto-mock.helper';
import { ActiveTabService } from '~services/active-tab.service';
import { DomService } from '~services/dom.service';
import { LocalStorageService } from '~services/local-storage.service';
import { Reminder, REMINDER_TYPE } from '../models/reminder.model';
import { ReminderService } from './reminder.service';

describe('ReminderService', () => {
  let service: ReminderService;
  let eventService: EventService;
  // let activeTabService: ActiveTabService;
  // let alertService: AlertService;
  // let domService: DomService;
  // let eventRealtimeService: EventRealtimeService;
  // let localStorageService: LocalStorageService;
  // let tenantOptionService: TenantOptionsService;
  // let translateService: TranslateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ReminderService,
        EventService,
        provideMock(ActiveTabService),
        provideMock(AlertService),
        provideMock(DomService),
        provideMock(EventRealtimeService),
        provideMock(LocalStorageService),
        provideMock(TenantOptionsService),
        provideMock(TranslateService),
      ],
    });

    service = TestBed.inject(ReminderService);
    eventService = TestBed.inject(EventService);
    // activeTabService = TestBed.inject(ActiveTabService);
    // alertService = TestBed.inject(AlertService);
    // domService = TestBed.inject(DomService);
    // eventRealtimeService = TestBed.inject(EventRealtimeService);
    // localStorageService = TestBed.inject(LocalStorageService);
    // tenantOptionService = TestBed.inject(TenantOptionsService);
    // translateService = TestBed.inject(TranslateService);
  });

  it('0 should be created', () => {
    expect(service).toBeTruthy();
  });

  it('1 should clear reminders', () => {
    service['reminders'] = [{ id: '1', time: new Date().toISOString() } as Reminder];

    service.clear();

    expect(service['reminders']).toEqual([]);
  });

  it('2 should update reminder status', async () => {
    const mockReminder: Reminder = {
      id: '1',
      source: { id: 'sourceId', name: 'sourceName' },
      type: REMINDER_TYPE,
      time: new Date().toISOString(),
      text: 'text',
      status: 'CLEARED',
    };

    const eventSpy = spyOn(eventService, 'update').and.returnValue(
      Promise.resolve({ data: mockReminder }) as Promise<IResult<Reminder>>
    );

    await service.update(mockReminder);

    expect(eventSpy).toHaveBeenCalledWith({
      id: mockReminder.id,
      status: mockReminder.status,
      isCleared: {},
    });
  });
});
