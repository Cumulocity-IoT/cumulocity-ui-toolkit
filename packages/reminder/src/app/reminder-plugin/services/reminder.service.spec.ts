import { ComponentRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EventService, IFetchResponse, IResult, TenantOptionsService } from '@c8y/client';
import { AlertService, EventRealtimeService, RealtimeMessage } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { BehaviorSubject, EMPTY } from 'rxjs';
import { provideMock } from '~helpers/auto-mock.helper';
import { ActiveTabService } from '~services/active-tab.service';
import { AssetAccessService } from '~services/asset-access.service';
import { DomService } from '~services/dom.service';
import { LocalStorageService } from '~services/local-storage.service';
import {
  REMINDER__LOCAL_STORAGE__CONFIG,
  REMINDER__TYPE,
  Reminder,
  ReminderGroupStatus,
  ReminderStatus,
  ReminderType,
} from '../models/reminder.model';
import { ReminderService } from './reminder.service';

const FETCH_RES = {} as IFetchResponse;

function makeReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'r-1',
    source: { id: 'device-1', name: 'Device 1' },
    type: REMINDER__TYPE,
    time: new Date().toISOString(),
    text: 'reminder.text.key',
    status: ReminderStatus.active,
    ...overrides,
  };
}

type ReminderServicePrivateForInit = {
  requestNotificationPermission: () => Promise<boolean>;
  fetchReminders: (pageSize: number, currentPage?: number) => Promise<Reminder[]>;
  fetchActiveReminderCounter: () => Promise<number>;
  setupConfigSubscription: () => void;
  setupReminderSubscription: () => void;
  createDrawer: () => void;
};

describe('ReminderService', () => {
  let service: ReminderService;
  let eventService: jasmine.SpyObj<EventService>;
  let domService: jasmine.SpyObj<DomService>;
  let localStorageService: jasmine.SpyObj<LocalStorageService>;
  let activeTabService: jasmine.SpyObj<ActiveTabService>;
  let tenantOptionsService: jasmine.SpyObj<TenantOptionsService>;
  let translateService: jasmine.SpyObj<TranslateService>;
  let assetAccessService: jasmine.SpyObj<AssetAccessService>;
  let eventRealtimeService: jasmine.SpyObj<EventRealtimeService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ReminderService,
        provideMock(EventService),
        provideMock(AlertService),
        {
          provide: EventRealtimeService,
          useValue: {
            onAll$: jasmine.createSpy('onAll$'),
          },
        },
        provideMock(TenantOptionsService),
        provideMock(TranslateService),
        provideMock(LocalStorageService),
        provideMock(ActiveTabService),
        provideMock(DomService),
        provideMock(AssetAccessService),
      ],
    });

    service = TestBed.inject(ReminderService);
    eventService = TestBed.inject(EventService) as jasmine.SpyObj<EventService>;
    domService = TestBed.inject(DomService) as jasmine.SpyObj<DomService>;
    localStorageService = TestBed.inject(
      LocalStorageService
    ) as jasmine.SpyObj<LocalStorageService>;
    activeTabService = TestBed.inject(ActiveTabService) as jasmine.SpyObj<ActiveTabService>;
    tenantOptionsService = TestBed.inject(
      TenantOptionsService
    ) as jasmine.SpyObj<TenantOptionsService>;
    translateService = TestBed.inject(TranslateService) as jasmine.SpyObj<TranslateService>;
    assetAccessService = TestBed.inject(AssetAccessService) as jasmine.SpyObj<AssetAccessService>;
    eventRealtimeService = TestBed.inject(
      EventRealtimeService
    ) as jasmine.SpyObj<EventRealtimeService>;

    // Service constructor calls ActiveTabService.init() immediately.
    expect(activeTabService.init.calls.count()).toBe(1);

    // Provide safe defaults used by init/setup subscriptions.
    Object.defineProperty(localStorageService, 'storage$', {
      value: EMPTY,
      configurable: true,
    });
    eventRealtimeService.onAll$.and.returnValue(EMPTY);
    localStorageService.getOrDefault.and.returnValue({});
    translateService.instant.and.callFake((key: string) => key);
    assetAccessService.getAssetIdsFromConfigAsync.and.resolveTo([]);
    tenantOptionsService.detail.and.resolveTo({ data: undefined, res: FETCH_RES });
    eventService.list.and.resolveTo({
      data: [],
      paging: { totalPages: 0 },
      res: FETCH_RES,
    } as never);

    const drawerOpen$ = new BehaviorSubject(false);

    domService.appendComponentToBody.and.returnValue({
      instance: {
        open$: drawerOpen$,
        toggleDrawer: jasmine.createSpy('toggleDrawer'),
      },
    } as ComponentRef<unknown>);
  });

  it('creates the service', () => {
    expect(service).toBeTruthy();
  });

  it('exposes default streams', () => {
    expect(service.open$.value).toBeFalse();
    expect(service.reminders$.value).toEqual([]);
    expect(service.reminderCounter$.value).toBe(0);
  });

  it('returns configured types via getter', () => {
    const types: ReminderType[] = [
      { id: 'type-a', name: 'A' },
      { id: 'type-b', name: 'B' },
    ];

    service['\x5ftypes'] = types;

    expect(service.types).toEqual(types);
  });

  describe('clear()', () => {
    it('resets reminders and counter stream values', () => {
      const past = new Date(Date.now() - 10_000).toISOString();

      service['reminders'] = [makeReminder({ id: 'one', time: past })];

      service.clear();

      expect(service.reminders$.value).toEqual([]);
      expect(service.reminderCounter$.value).toBe(0);
    });
  });

  describe('destroy()', () => {
    it('destroys the drawer component when created', () => {
      service['createDrawer']();

      service.destroy();

      expect(domService.destroyComponent.calls.count()).toBe(1);
    });

    it('unsubscribes internal subscriptions even when drawer is missing', () => {
      const unsubscribeSpy = spyOn(service['subscriptions'], 'unsubscribe');

      service.destroy();

      expect(unsubscribeSpy.calls.count()).toBe(1);
      expect(domService.destroyComponent.calls.count()).toBe(0);
    });
  });

  describe('setConfig() and resetFilterConfig()', () => {
    it('updates config and persists it to local storage', () => {
      service.config$.next({ toast: false });

      service.setConfig('toast', true);

      expect(localStorageService.set.calls.mostRecent().args).toEqual([
        REMINDER__LOCAL_STORAGE__CONFIG,
        { toast: true },
      ]);
      expect(service.config$.value.toast).toBeTrue();
    });

    it('removes the filter key from config', () => {
      service.config$.next({ filter: { reminderType: 't-1' }, browser: true });

      service.resetFilterConfig();

      expect(service.config$.value).toEqual({ browser: true });
    });
  });

  describe('toggleDrawer()', () => {
    it('forwards toggle calls to drawer instance when present', () => {
      const toggleSpy = jasmine.createSpy('toggleDrawer');

      service['drawer'] = { toggleDrawer: toggleSpy } as never;
      service.toggleDrawer();

      expect(toggleSpy).toHaveBeenCalled();
    });

    it('does nothing when drawer is not created yet', () => {
      expect(() => service.toggleDrawer()).not.toThrow();
    });
  });

  describe('getReminderTypeName()', () => {
    it('returns the translated name for known type ids', () => {
      service['\x5ftypes'] = [{ id: 'type-1', name: 'Type One' }];

      expect(service.getReminderTypeName('type-1')).toBe('Type One');
    });

    it('returns UNKNOWN for missing type ids', () => {
      service['\x5ftypes'] = [];

      expect(service.getReminderTypeName('missing')).toBe(ReminderStatus.unknown);
    });
  });

  describe('groupReminders()', () => {
    it('returns empty due/upcoming/cleared groups for empty input', () => {
      const result = service.groupReminders([]);

      expect(result.map((group) => group.status)).toEqual([
        ReminderGroupStatus.due,
        ReminderGroupStatus.upcoming,
        ReminderGroupStatus.cleared,
      ]);
      expect(result.every((group) => group.count === 0)).toBeTrue();
    });

    it('splits reminders into due, upcoming, and cleared groups', () => {
      const now = Date.now();
      const reminders: Reminder[] = [
        makeReminder({ id: 'due', time: new Date(now - 60_000).toISOString() }),
        makeReminder({ id: 'upcoming', time: new Date(now + 60_000).toISOString() }),
        makeReminder({
          id: 'cleared',
          status: ReminderStatus.cleared,
          time: new Date(now - 60_000).toISOString(),
        }),
      ];

      const result = service.groupReminders(reminders);

      expect(result.find((group) => group.status === ReminderGroupStatus.due)?.count).toBe(1);
      expect(result.find((group) => group.status === ReminderGroupStatus.upcoming)?.count).toBe(1);
      expect(result.find((group) => group.status === ReminderGroupStatus.cleared)?.count).toBe(1);
    });

    it('applies context filter when enabled in config', () => {
      const now = Date.now();
      const targetId = 'asset-target';

      service.config$.next({ useContext: true, filter: { reminderType: '' } });

      const reminders: Reminder[] = [
        makeReminder({
          id: 'a',
          source: { id: targetId, name: 'A' },
          time: new Date(now).toISOString(),
        }),
        makeReminder({
          id: 'b',
          source: { id: 'asset-other', name: 'B' },
          time: new Date(now).toISOString(),
        }),
      ];

      const result = service.groupReminders(reminders, targetId);
      const dueGroup = result.find((group) => group.status === ReminderGroupStatus.due);

      expect(dueGroup?.total).toBe(2);
      expect(dueGroup?.count).toBe(1);
      expect(dueGroup?.reminders[0].source.id).toBe(targetId);
    });

    it('applies reminderType filter when configured', () => {
      const now = new Date(Date.now() - 1000).toISOString();

      service.config$.next({
        useContext: false,
        filter: { reminderType: 'type-b' },
      });

      const reminders: Reminder[] = [
        makeReminder({ id: 'a', time: now, reminderType: 'type-a' }),
        makeReminder({ id: 'b', time: now, reminderType: 'type-b' }),
      ];

      const result = service.groupReminders(reminders);
      const dueGroup = result.find((group) => group.status === ReminderGroupStatus.due);

      expect(dueGroup?.count).toBe(1);
      expect(dueGroup?.reminders[0].id).toBe('b');
      expect(service.config$.value.filter).toEqual({ reminderType: 'type-b' });
    });
  });

  describe('update()', () => {
    it('sets isCleared fragment when status is CLEARED', async () => {
      const reminder = makeReminder({ status: ReminderStatus.cleared });
      const response = { data: reminder, res: FETCH_RES } as IResult<Reminder>;

      eventService.update.and.resolveTo(response);

      await service.update(reminder);

      expect(eventService.update.calls.mostRecent().args[0]).toEqual({
        id: reminder.id,
        status: ReminderStatus.cleared,
        isCleared: {},
      });
    });

    it('unsets isCleared fragment when status is not CLEARED', async () => {
      const reminder = makeReminder({ status: ReminderStatus.active });
      const response = { data: reminder, res: FETCH_RES } as IResult<Reminder>;

      eventService.update.and.resolveTo(response);

      await service.update(reminder);

      expect(eventService.update.calls.mostRecent().args[0]).toEqual({
        id: reminder.id,
        status: ReminderStatus.active,
        isCleared: null,
      });
    });
  });

  describe('init()', () => {
    beforeEach(() => {
      const privateService = service as unknown as ReminderServicePrivateForInit;

      // Avoid Notification API coupling in unit tests.
      spyOn(privateService, 'requestNotificationPermission').and.resolveTo(true);
      spyOn(privateService, 'fetchReminders').and.resolveTo([]);
      spyOn(privateService, 'fetchActiveReminderCounter').and.resolveTo(0);
      spyOn(privateService, 'setupConfigSubscription').and.callFake(() => undefined);
      spyOn(privateService, 'setupReminderSubscription').and.callFake(() => undefined);
    });

    it('loads config, creates drawer, and initializes reminders', async () => {
      const typesResponse = {
        data: {
          value: JSON.stringify([
            { id: 'b', name: 'type.b' },
            { id: 'a', name: 'type.a' },
          ]),
        },
        res: FETCH_RES,
      };

      localStorageService.getOrDefault.and.returnValue({ useContext: false });
      tenantOptionsService.detail.and.callFake((query) => {
        if (query.key === 'types') return typesResponse as never;

        return Promise.resolve({
          data: { value: JSON.stringify({ useContext: true }) },
          res: FETCH_RES,
        } as never);
      });

      await service.init();

      expect(service.contextFilterAvailable()).toBeTrue();
      expect(service.types.map((type) => type.id)).toEqual(['a', 'b']);
      expect(domService.appendComponentToBody.calls.count()).toBe(1);
      expect(service.reminders$.value).toEqual([]);
    });

    it('resets useContext config when tenant disallows context filtering', async () => {
      localStorageService.getOrDefault.and.returnValue({ useContext: true });
      tenantOptionsService.detail.and.resolveTo({
        data: { value: JSON.stringify({ useContext: false }) },
        res: FETCH_RES,
      } as never);

      await service.init();

      expect(service.contextFilterAvailable()).toBeFalse();
      expect(localStorageService.set.calls.mostRecent().args).toEqual([
        REMINDER__LOCAL_STORAGE__CONFIG,
        { useContext: false },
      ]);
      expect(service.config$.value.useContext).toBeFalse();
    });

    it('loads responsibility ids and enables stream when configured', async () => {
      localStorageService.getOrDefault.and.returnValue({ useContext: false });
      tenantOptionsService.detail.and.callFake((query) => {
        if (query.key === 'config') {
          return Promise.resolve({
            data: {
              value: JSON.stringify({
                useContext: false,
                responsibilityFilter: {
                  enabled: true,
                  method: 'inventoryQuery',
                  query: '$filter=id ne null',
                },
              }),
            },
            res: FETCH_RES,
          } as never);
        }

        return Promise.resolve({ data: { value: '[]' }, res: FETCH_RES } as never);
      });
      assetAccessService.getAssetIdsFromConfigAsync.and.resolveTo(['a1', 'a2']);

      await service.init();

      expect(service.responsibilityFilterEnabled$.value).toBeTrue();
      expect(assetAccessService.getAssetIdsFromConfigAsync.calls.count()).toBe(1);
    });

    it('is idempotent when drawer already exists', async () => {
      service['drawer'] = { toggleDrawer: jasmine.createSpy('toggleDrawer') } as never;
      const createDrawerSpy = spyOn(
        service as unknown as ReminderServicePrivateForInit,
        'createDrawer'
      );

      await service.init();

      expect(createDrawerSpy.calls.count()).toBe(0);
      expect(tenantOptionsService.detail.calls.count()).toBe(0);
    });
  });

  describe('realtime update handling through setupReminderSubscription()', () => {
    it('increments active reminder counter for CREATE actions', () => {
      const now = new Date(Date.now() - 5_000).toISOString();
      const source$ = new BehaviorSubject({
        realtimeAction: 'CREATE',
        data: makeReminder({ id: 'new', time: now, status: ReminderStatus.active }),
      } as RealtimeMessage<Reminder>);

      eventRealtimeService.onAll$.and.returnValue(source$);
      service['\x5freminders'] = [];

      service['setupReminderSubscription']();

      expect(service.reminderCounter$.value).toBe(1);
      expect(service.reminders$.value.length).toBe(1);
    });

    it('decrements active reminder counter for DELETE actions', () => {
      const now = new Date(Date.now() - 5_000).toISOString();
      const initial = makeReminder({ id: 'to-delete', time: now, status: ReminderStatus.active });

      service['\x5freminders'] = [initial];
      service['\x5freminderCounter'] = 1;
      service.reminders$.next([initial]);
      service.reminderCounter$.next(1);

      const source$ = new BehaviorSubject({
        realtimeAction: 'DELETE',
        data: 'to-delete',
      } as never);

      eventRealtimeService.onAll$.and.returnValue(source$);

      service['setupReminderSubscription']();

      expect(service.reminderCounter$.value).toBe(0);
      expect(service.reminders$.value).toEqual([]);
    });
  });
});
