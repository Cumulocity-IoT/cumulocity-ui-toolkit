import { TestBed } from '@angular/core/testing';
import { EventService, IResult, TenantOptionsService } from '@c8y/client';
import { AlertService, EventRealtimeService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, EMPTY } from 'rxjs';
import { provideMock } from '~helpers/auto-mock.helper';
import { ActiveTabService } from '~services/active-tab.service';
import { DomService } from '~services/dom.service';
import { LocalStorageService } from '~services/local-storage.service';
import {
  Reminder,
  ReminderGroup,
  ReminderGroupStatus,
  REMINDER__TENANT_OPTION__CATEGORY,
  REMINDER__TENANT_OPTION__CONFIG_KEY,
  REMINDER__TYPE,
} from '../models/reminder.model';
import { ReminderService } from './reminder.service';

describe('ReminderService', () => {
  let service: ReminderService;
  let eventService: EventService;
  let domService: DomService;
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
    domService = TestBed.inject(DomService);
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

  it('2 should initialize open$ with a default value', () => {
    expect(service.open$.value).toBe(false);
  });

  it('3 should bridge drawer open state to open$', () => {
    const drawerOpen$ = new BehaviorSubject<boolean>(false);

    jest.spyOn(domService, 'appendComponentToBody').mockReturnValue({
      instance: { open$: drawerOpen$ },
    } as never);

    service['createDrawer']();

    drawerOpen$.next(true);

    expect(service.open$.value).toBe(true);
  });

  describe('context filter by tenant option', () => {
    let tenantOptionService: TenantOptionsService;

    beforeEach(() => {
      tenantOptionService = TestBed.inject(TenantOptionsService);
    });

    const tenantOptionKey = {
      category: REMINDER__TENANT_OPTION__CATEGORY,
      key: REMINDER__TENANT_OPTION__CONFIG_KEY,
    };

    it('5 should set contextFilterAvailable=true when tenant option enables useContext', async () => {
      jest.spyOn(tenantOptionService, 'detail').mockResolvedValue({
        data: { value: JSON.stringify({ useContext: true }) },
      } as never);

      await service['fetchTenantConfig']();

      expect(tenantOptionService.detail).toHaveBeenCalledWith(tenantOptionKey);
    });

    it('6 should return useContext=true from tenant option response', async () => {
      jest.spyOn(tenantOptionService, 'detail').mockResolvedValue({
        data: { value: JSON.stringify({ useContext: true }) },
      } as never);

      const result = await service['fetchTenantConfig']();

      expect(result.useContext).toBe(true);
    });

    it('7 should return empty config when tenant option is absent (throws)', async () => {
      jest.spyOn(tenantOptionService, 'detail').mockRejectedValue(new Error('404'));

      const result = await service['fetchTenantConfig']();

      expect(result).toEqual({});
    });

    it('8 should return useContext=false when tenant option explicitly disables it', async () => {
      jest.spyOn(tenantOptionService, 'detail').mockResolvedValue({
        data: { value: JSON.stringify({ useContext: false }) },
      } as never);

      const result = await service['fetchTenantConfig']();

      expect(result.useContext).toBe(false);
    });

    it('9 should set contextFilterAvailable from tenant config during init', async () => {
      jest.spyOn(tenantOptionService, 'detail').mockResolvedValue({
        data: { value: JSON.stringify({ useContext: true }) },
      } as never);
      jest.spyOn(service['domService'], 'appendComponentToBody').mockReturnValue({
        instance: { open$: new BehaviorSubject(false) },
      } as never);
      jest
        .spyOn(service['eventService'], 'list')
        .mockResolvedValue({ data: [], paging: { totalPages: 0 } } as never);
      jest.spyOn(service['localStorageService'], 'getOrDefault').mockReturnValue({});
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service['localStorageService'] as any).storage$ = EMPTY;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service['eventRealtimeService'] as any).onAll$ = jest.fn().mockReturnValue(EMPTY);

      await service.init();

      expect(service.contextFilterAvailable).toBe(true);
    });

    it('10 should set contextFilterAvailable=false and reset useContext config when tenant option disallows it', async () => {
      jest.spyOn(tenantOptionService, 'detail').mockRejectedValue(new Error('404'));
      jest.spyOn(service['domService'], 'appendComponentToBody').mockReturnValue({
        instance: { open$: new BehaviorSubject(false) },
      } as never);
      jest
        .spyOn(service['eventService'], 'list')
        .mockResolvedValue({ data: [], paging: { totalPages: 0 } } as never);
      jest
        .spyOn(service['localStorageService'], 'getOrDefault')
        .mockReturnValue({ useContext: true });
      jest.spyOn(service['localStorageService'], 'set').mockReturnValue(undefined);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service['localStorageService'] as any).storage$ = EMPTY;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (service['eventRealtimeService'] as any).onAll$ = jest.fn().mockReturnValue(EMPTY);

      await service.init();

      expect(service.contextFilterAvailable).toBe(false);
      expect(service.config$.getValue().useContext).toBe(false);
    });
  });

  describe('applyContextFilter', () => {
    const makeGroups = (sourceIds: string[]): ReminderGroup[] => [
      {
        status: ReminderGroupStatus.due,
        count: sourceIds.length,
        reminders: sourceIds.map((id) => ({ source: { id } }) as Reminder),
      },
    ];

    it('11 should filter reminders to matching source when useContext=true and context provided', () => {
      service.config$.next({ useContext: true });
      const groups = makeGroups(['device-1', 'device-2', 'device-3']);

      const result = service['applyContextFilter'](groups, 'device-2');

      expect(result[0].reminders).toHaveLength(1);
      expect(result[0].reminders[0].source.id).toBe('device-2');
    });

    it('12 should set group.total to original count before filtering', () => {
      service.config$.next({ useContext: true });
      const groups = makeGroups(['device-1', 'device-2', 'device-3']);

      const result = service['applyContextFilter'](groups, 'device-2');

      expect(result[0].total).toBe(3);
    });

    it('13 should return all reminders unchanged when useContext=false', () => {
      service.config$.next({ useContext: false });
      const groups = makeGroups(['device-1', 'device-2']);

      const result = service['applyContextFilter'](groups, 'device-1');

      expect(result[0].reminders).toHaveLength(2);
    });

    it('14 should return all reminders unchanged when context is not provided', () => {
      service.config$.next({ useContext: true });
      const groups = makeGroups(['device-1', 'device-2']);

      const result = service['applyContextFilter'](groups, undefined);

      expect(result[0].reminders).toHaveLength(2);
    });
  });

  it('4 should update reminder status', async () => {
    const mockReminder: Reminder = {
      id: '1',
      source: { id: 'sourceId', name: 'sourceName' },
      type: REMINDER__TYPE,
      time: new Date().toISOString(),
      text: 'text',
      status: 'CLEARED',
    };

    const eventSpy = jest
      .spyOn(eventService, 'update')
      .mockResolvedValue({ data: mockReminder } as IResult<Reminder>);

    await service.update(mockReminder);

    expect(eventSpy).toHaveBeenCalledWith({
      id: mockReminder.id,
      status: mockReminder.status,
      isCleared: {},
    });
  });
});
