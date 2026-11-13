import { ComponentRef, signal } from '@angular/core';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { EventService, IFetchResponse, IResult } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { EMPTY, Subject } from 'rxjs';
import { provideMock } from '~helpers/auto-mock.helper';
import { ActiveTabService } from '~services/active-tab.service';
import { AssetAccessService } from '~services/asset-access.service';
import { DomService } from '~services/dom.service';
import { LocalStorageService } from '~services/local-storage.service';
import { TenantOptionHelperService } from '~services/tenant-options-helper.service';
import {
  REMINDER__LOCAL_STORAGE__CONFIG,
  REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG,
  REMINDER__ANNOUNCE_WINDOW_MS,
  REMINDER__COUNTER_MAX_AGE_MS,
  REMINDER__INITIAL_QUERY_SIZE,
  REMINDER__LOCAL_STORAGE__ANNOUNCED,
  REMINDER__POLL_INTERVAL_MS,
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
  fetchReminders: (
    pageSize: number,
    currentPage?: number
  ) => Promise<{ reminders: Reminder[]; complete: boolean }>;
  fetchActiveReminderCounter: () => Promise<number>;
  setupConfigSubscription: () => void;
  startPolling: () => void;
  createDrawer: () => void;
};

describe('ReminderService', () => {
  let service: ReminderService;
  let eventService: jasmine.SpyObj<EventService>;
  let domService: jasmine.SpyObj<DomService>;
  let localStorageService: jasmine.SpyObj<LocalStorageService>;
  let activeTabService: jasmine.SpyObj<ActiveTabService>;
  let tenantOptionHelperService: jasmine.SpyObj<TenantOptionHelperService>;
  let translateService: jasmine.SpyObj<TranslateService>;
  let assetAccessService: jasmine.SpyObj<AssetAccessService>;
  let storage: Record<string, unknown>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ReminderService,
        provideMock(EventService),
        provideMock(AlertService),
        provideMock(TenantOptionHelperService),
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
    tenantOptionHelperService = TestBed.inject(
      TenantOptionHelperService
    ) as jasmine.SpyObj<TenantOptionHelperService>;
    translateService = TestBed.inject(TranslateService) as jasmine.SpyObj<TranslateService>;
    assetAccessService = TestBed.inject(AssetAccessService) as jasmine.SpyObj<AssetAccessService>;

    // Service constructor calls ActiveTabService.init() immediately.
    expect(activeTabService.init.calls.count()).toBe(1);

    // Provide safe defaults used by init/setup subscriptions.
    Object.defineProperty(localStorageService, 'storage$', {
      value: EMPTY,
      configurable: true,
    });
    // in-memory local storage; the config key defaults to an empty config
    storage = {};
    localStorageService.getOrDefault.and.callFake(((key: string, fallback: unknown) =>
      key in storage
        ? storage[key]
        : key === REMINDER__LOCAL_STORAGE__CONFIG
          ? {}
          : fallback) as never);
    localStorageService.set.and.callFake(((key: string, value: unknown) => {
      storage[key] = value;

      return value;
    }) as never);
    translateService.instant.and.callFake((key: string) => key);
    assetAccessService.getAssetIdsFromConfigAsync.and.resolveTo([]);
    tenantOptionHelperService.getOptionsByCategory.and.resolveTo({});
    eventService.list.and.resolveTo({
      data: [],
      paging: { totalPages: 0 },
      res: FETCH_RES,
    } as never);

    domService.appendComponentToBody.and.returnValue({
      instance: {
        open: signal(false),
        openChange: new Subject<boolean>(),
        toggleDrawer: jasmine.createSpy('toggleDrawer'),
      },
    } as ComponentRef<unknown>);
  });

  it('creates the service', () => {
    expect(service).toBeTruthy();
  });

  it('exposes default streams', () => {
    expect(service.open()).toBeFalse();
    expect(service.reminders()).toEqual([]);
    expect(service.reminderCounter()).toBe(0);
  });

  it('returns configured types via getter', () => {
    const types: ReminderType[] = [
      { id: 'type-a', name: 'A' },
      { id: 'type-b', name: 'B' },
    ];

    service['_reminderTypes'] = types;

    expect(service.types).toEqual(types);
  });

  describe('clear()', () => {
    it('resets reminders and counter stream values', () => {
      const past = new Date(Date.now() - 10_000).toISOString();

      service.reminders.set([makeReminder({ id: 'one', time: past })]);

      service.clear();

      expect(service.reminders()).toEqual([]);
      expect(service.reminderCounter()).toBe(0);
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
      service.config.set({ toast: false });

      service.setConfig('toast', true);

      expect(localStorageService.set.calls.mostRecent().args).toEqual([
        REMINDER__LOCAL_STORAGE__CONFIG,
        { toast: true },
      ]);
      expect(service.config().toast).toBeTrue();
    });

    it('removes the filter key from config', () => {
      service.config.set({ filter: { reminderType: 't-1' }, browser: true });

      service.resetFilterConfig();

      expect(service.config()).toEqual({ browser: true });
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
      service['_reminderTypes'] = [{ id: 'type-1', name: 'Type One' }];

      expect(service.getReminderTypeName('type-1')).toBe('Type One');
    });

    it('returns UNKNOWN for missing type ids', () => {
      service['_reminderTypes'] = [];

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

      service.config.set({ useContext: true, filter: { reminderType: '' } });

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

      service.config.set({
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
      expect(service.config().filter).toEqual({ reminderType: 'type-b' });
    });

    it('does not rewrite configuration while grouping reminders', () => {
      service.config.set({ filter: { reminderType: 'maintenance' } });

      service.groupReminders([makeReminder({ reminderType: 'maintenance' })]);

      expect(localStorageService.set).not.toHaveBeenCalled();
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
      spyOn(privateService, 'fetchReminders').and.resolveTo({ reminders: [], complete: true });
      spyOn(privateService, 'fetchActiveReminderCounter').and.resolveTo(0);
      spyOn(privateService, 'setupConfigSubscription').and.callFake(() => undefined);
      spyOn(privateService, 'startPolling').and.callFake(() => undefined);
    });

    it('loads config and reminders without creating the drawer', async () => {
      localStorageService.getOrDefault.and.returnValue({ useContext: false });
      tenantOptionHelperService.getOptionsByCategory.and.resolveTo({
        types: [
          { id: 'b', name: 'type.b' },
          { id: 'a', name: 'type.a' },
        ],
        config: { useContext: true },
      });

      await service.init();

      expect(service.contextFilterAvailable()).toBeTrue();
      expect(service.types.map((type) => type.id)).toEqual(['a', 'b']);
      expect(domService.appendComponentToBody).not.toHaveBeenCalled();
      expect(service.reminders()).toEqual([]);
    });

    it('creates and opens the drawer on first toggle', () => {
      service.toggleDrawer();

      expect(domService.appendComponentToBody.calls.count()).toBe(1);
      expect(
        (
          domService.appendComponentToBody.calls.mostRecent().returnValue.instance as {
            toggleDrawer: jasmine.Spy;
          }
        ).toggleDrawer
      ).toHaveBeenCalled();
    });

    it('resets useContext config when tenant disallows context filtering', async () => {
      localStorageService.getOrDefault.and.returnValue({ useContext: true });
      tenantOptionHelperService.getOptionsByCategory.and.resolveTo({
        config: { useContext: false },
      });

      await service.init();

      expect(service.contextFilterAvailable()).toBeFalse();
      expect(localStorageService.set.calls.mostRecent().args).toEqual([
        REMINDER__LOCAL_STORAGE__CONFIG,
        { useContext: false },
      ]);
      expect(service.config().useContext).toBeFalse();
    });

    it('loads responsibility ids and enables stream when configured', async () => {
      localStorageService.getOrDefault.and.returnValue({ useContext: false });
      tenantOptionHelperService.getOptionsByCategory.and.resolveTo({
        types: [],
        config: {
          useContext: false,
          responsibilityFilter: {
            enabled: true,
            method: 'inventoryQuery',
            query: '$filter=id ne null',
          },
        },
      });
      assetAccessService.getAssetIdsFromConfigAsync.and.resolveTo(['a1', 'a2']);
      const privateService = service as unknown as ReminderServicePrivateForInit;
      const past = new Date(Date.now() - 60_000).toISOString();
      const future = new Date(Date.now() + 60_000).toISOString();

      // In responsibility mode the counter comes from the filtered list, not the API
      // total, even when the list holds a full page (which otherwise needs the API).
      (privateService.fetchActiveReminderCounter as jasmine.Spy).and.resolveTo(99);
      (privateService.fetchReminders as jasmine.Spy).and.resolveTo({
        reminders: [
          makeReminder({ id: 'due', time: past }),
          ...Array.from({ length: REMINDER__INITIAL_QUERY_SIZE - 1 }, (_, index) =>
            makeReminder({ id: `upcoming-${index}`, time: future })
          ),
        ],
        complete: false,
      });

      await service.init();

      expect(service.responsibilityFilterEnabled()).toBeTrue();
      expect(assetAccessService.getAssetIdsFromConfigAsync.calls.count()).toBe(1);
      expect(privateService.fetchActiveReminderCounter).not.toHaveBeenCalled();
      expect(service.reminderCounter()).toBe(1);
      service.destroy();
    });

    it('is idempotent when drawer already exists', async () => {
      service['drawer'] = { toggleDrawer: jasmine.createSpy('toggleDrawer') } as never;
      const createDrawerSpy = spyOn(
        service as unknown as ReminderServicePrivateForInit,
        'createDrawer'
      );

      await service.init();

      expect(createDrawerSpy.calls.count()).toBe(0);
      expect(tenantOptionHelperService.getOptionsByCategory.calls.count()).toBe(0);
    });

    it('enables browser notifications after permission is granted', async () => {
      await service.setBrowserNotifications(true);

      expect(service.config().browser).toBeTrue();
      expect(localStorageService.set).toHaveBeenCalledWith(REMINDER__LOCAL_STORAGE__CONFIG, {
        browser: true,
      });
    });

    it('disables browser notifications without requesting permission', async () => {
      const privateService = service as unknown as ReminderServicePrivateForInit;

      await service.setBrowserNotifications(false);

      expect(privateService.requestNotificationPermission).not.toHaveBeenCalled();
      expect(service.config().browser).toBeFalse();
    });
  });

  describe('polling', () => {
    let due: string;
    let later: string;
    let alertService: jasmine.SpyObj<AlertService>;

    /** `count` reminders, the first one `first`, the rest due in a day. */
    function page(count: number, first: Partial<Reminder> = {}): Reminder[] {
      return Array.from({ length: count }, (_, index) =>
        index === 0
          ? makeReminder({ id: 'polled', time: due, ...first })
          : makeReminder({ id: `r-${index}`, time: later })
      );
    }

    /** Serves the reminder list and the counter query (the one filtering on `status`). */
    function serve(list: () => Reminder[], counter: () => number = () => 7): void {
      eventService.list.and.callFake(((filter: { fragmentType?: string }) =>
        Promise.resolve(
          filter.fragmentType
            ? { data: [], paging: { totalPages: counter() }, res: FETCH_RES }
            : { data: list().map((r) => ({ ...r })), paging: {}, res: FETCH_RES }
        )) as never);
    }

    function countQueries(): number {
      return eventService.list.calls
        .allArgs()
        .filter(([filter]) => (filter as { fragmentType?: string }).fragmentType).length;
    }

    beforeEach(() => {
      // fixed per test: a poll must see the same content unless a test changes it
      due = new Date(Date.now() - 5_000).toISOString();
      later = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      alertService = TestBed.inject(AlertService) as jasmine.SpyObj<AlertService>;
      activeTabService.isActive.and.returnValue(true);
      serve(() => page(1));
    });

    afterEach(() => service.destroy());

    it('replaces reminders and counts from the list when it is complete', async () => {
      service.reminders.set([makeReminder({ id: 'stale' })]);

      await service.refresh();

      expect(service.reminders().map((r) => r.id)).toEqual(['polled']);
      expect(service.reminderCounter()).toBe(1);
      expect(countQueries()).toBe(0);
      expect(service.lastLoaded()).toBeDefined();
    });

    it('uses the API counter when the list holds only the first page', async () => {
      serve(() => page(REMINDER__INITIAL_QUERY_SIZE));

      await service.refresh();

      expect(service.reminderCounter()).toBe(7);
      expect(countQueries()).toBe(1);
    });

    it('does not request a page total for the reminder list', async () => {
      await service.refresh();

      const listQuery = eventService.list.calls
        .allArgs()
        .map(([filter]) => filter as Record<string, unknown>)
        .find((filter) => !filter['fragmentType']);

      expect(listQuery).toBeDefined();
      expect(listQuery?.['withTotalPages']).toBeUndefined();
    });

    it('keeps the array and its objects when a poll returns unchanged content', async () => {
      await service.refresh();
      const previous = service.reminders();
      const previousObject = previous[0];

      await service.refresh();

      expect(service.reminders()).toBe(previous);
      expect(service.reminders()[0]).toBe(previousObject);
    });

    it('pushes a new array but keeps the object when a reminder became due', async () => {
      await service.refresh();
      const previous = service.reminders();
      const existing = previous[0];

      existing.diff = -1_000; // as digested before its due time

      await service.refresh();

      expect(service.reminders()).not.toBe(previous);
      expect(service.reminders()[0]).toBe(existing);
      expect(existing.diff).toBeGreaterThan(0);
    });

    it('keeps an optimistic status change until the API reports a real change', async () => {
      await service.refresh();
      const previous = service.reminders();
      const existing = previous[0];

      // the drawer sets the new status before the update request completes
      existing.status = ReminderStatus.cleared;
      // a poll that started earlier still returns the old status
      await service.refresh();

      expect(service.reminders()).toBe(previous);
      expect(existing.status).toBe(ReminderStatus.cleared);

      serve(() => page(1, { status: ReminderStatus.cleared, lastUpdated: 'later' }));
      await service.refresh();

      expect(service.reminders()).not.toBe(previous);
      expect(service.reminders()[0].status).toBe(ReminderStatus.cleared);
    });

    it('does not write state when a load completes after destroy', async () => {
      const pending = service.refresh();

      service.destroy();
      await pending;

      expect(service.reminders()).toEqual([]);
      expect(service.lastLoaded()).toBeUndefined();
    });

    it('keeps the list on failure and alerts once per failure streak', async () => {
      await service.refresh();
      const current = service.reminders();

      eventService.list.and.rejectWith('offline');
      await service.refresh();
      await service.refresh();

      expect(service.reminders()).toBe(current);
      expect(alertService.danger).toHaveBeenCalledTimes(1);

      // recovery, then a new failure streak alerts again
      serve(() => page(1));
      await service.refresh();
      eventService.list.and.rejectWith('offline');
      await service.refresh();

      expect(alertService.danger).toHaveBeenCalledTimes(2);
    });

    it('polls every REMINDER__POLL_INTERVAL_MS and stops on destroy', fakeAsync(() => {
      service['startPolling']();

      tick(REMINDER__POLL_INTERVAL_MS);
      flushMicrotasks();
      expect(eventService.list).toHaveBeenCalledTimes(1);

      tick(REMINDER__POLL_INTERVAL_MS);
      flushMicrotasks();
      expect(eventService.list).toHaveBeenCalledTimes(2);

      service.destroy();
      tick(REMINDER__POLL_INTERVAL_MS * 2);
      expect(eventService.list).toHaveBeenCalledTimes(2);
    }));

    it('coalesces concurrent refreshes into a single follow-up load', fakeAsync(() => {
      void service.refresh();
      void service.refresh();
      void service.refresh();
      flushMicrotasks();

      // initial load + one follow-up
      expect(eventService.list).toHaveBeenCalledTimes(2);
      service.destroy();
    }));

    it('skips the visibility refresh right after a load', async () => {
      await service.refresh();
      const refreshSpy = spyOn(service, 'refresh').and.resolveTo();

      spyOnProperty(document, 'visibilityState').and.returnValue('visible');
      service['startPolling']();
      document.dispatchEvent(new Event('visibilitychange'));

      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('refreshes when the tab becomes visible again', () => {
      const refreshSpy = spyOn(service, 'refresh').and.resolveTo();

      spyOnProperty(document, 'visibilityState').and.returnValue('visible');
      service['startPolling']();

      document.dispatchEvent(new Event('visibilitychange'));

      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    it('removes the visibility listener on destroy', () => {
      const refreshSpy = spyOn(service, 'refresh').and.resolveTo();

      spyOnProperty(document, 'visibilityState').and.returnValue('visible');
      service['startPolling']();
      service.destroy();

      document.dispatchEvent(new Event('visibilitychange'));

      expect(refreshSpy).not.toHaveBeenCalled();
    });

    it('stops init when destroyed while a request is pending', async () => {
      let resolveOptions!: (value: unknown) => void;
      const addListener = spyOn(document, 'addEventListener').and.callThrough();

      tenantOptionHelperService.getOptionsByCategory.and.returnValue(
        new Promise((resolve) => (resolveOptions = resolve)) as never
      );

      const pending = service.init();

      service.destroy();
      resolveOptions({});
      await pending;

      expect(eventService.list).not.toHaveBeenCalled();
      expect(addListener).not.toHaveBeenCalledWith('visibilitychange', jasmine.any(Function));
      // nothing after the pending request ran: no config loaded or written
      expect(localStorageService.getOrDefault).not.toHaveBeenCalled();
      expect(localStorageService.set).not.toHaveBeenCalled();
      expect(service.config()).toEqual({});
    });

    it('keeps the new list when only the counter query fails', async () => {
      serve(
        () => page(REMINDER__INITIAL_QUERY_SIZE),
        () => {
          throw new Error('count failed');
        }
      );

      await service.refresh();

      expect(service.reminders().length).toBe(REMINDER__INITIAL_QUERY_SIZE);
      expect(alertService.danger).toHaveBeenCalledTimes(1);
      expect(service.lastLoaded()).toBeUndefined();
    });

    it('skips the count query while the first page is unchanged and the counter is recent', async () => {
      serve(() => page(REMINDER__INITIAL_QUERY_SIZE));

      await service.refresh();
      await service.refresh();

      expect(countQueries()).toBe(1);
    });

    it('reloads the counter after REMINDER__COUNTER_MAX_AGE_MS', fakeAsync(() => {
      serve(() => page(REMINDER__INITIAL_QUERY_SIZE));

      void service.refresh();
      flushMicrotasks();
      tick(REMINDER__COUNTER_MAX_AGE_MS);
      void service.refresh();
      flushMicrotasks();

      expect(countQueries()).toBe(2);
      service.destroy();
    }));

    it('reloads the counter after a reminder update', fakeAsync(() => {
      serve(() => page(REMINDER__INITIAL_QUERY_SIZE));
      eventService.update.and.resolveTo({ data: makeReminder(), res: FETCH_RES });

      void service.refresh();
      flushMicrotasks();
      void service.update(makeReminder({ id: 'r-99' }));
      flushMicrotasks();

      expect(countQueries()).toBe(2);
      service.destroy();
    }));

    it('announces reminders that became due after start while the first loads failed', fakeAsync(() => {
      service.config.set({ toast: true });
      eventService.list.and.rejectWith('offline');

      void service.refresh();
      flushMicrotasks();
      tick(1_000);

      const time = new Date(Date.now() - 500).toISOString();

      serve(() => page(1, { time }));
      void service.refresh();
      flushMicrotasks();

      expect(alertService.add).toHaveBeenCalledTimes(1);
      service.destroy();
    }));

    it('starts the announcement window when the tab starts, before any load', () => {
      // the tab claims "active" in the constructor; reminders due from then on are its job
      expect(service['announceFrom']).toBeLessThanOrEqual(Date.now());
      expect(eventService.list).not.toHaveBeenCalled();
    });

    it('retries the count query after it failed on a changed list', async () => {
      let failCount = false;

      serve(
        () => page(REMINDER__INITIAL_QUERY_SIZE),
        () => {
          if (failCount) throw new Error('count failed');

          return 7;
        }
      );
      await service.refresh();

      // the list changes, but the count query fails
      serve(
        () => page(REMINDER__INITIAL_QUERY_SIZE, { text: 'edited' }),
        () => {
          if (failCount) throw new Error('count failed');

          return 8;
        }
      );
      failCount = true;
      await service.refresh();
      failCount = false;

      // unchanged list: the counter is still outdated, so it is queried again
      await service.refresh();

      expect(countQueries()).toBe(3);
      expect(service.reminderCounter()).toBe(8);
    });

    it('keeps a counter invalidation that arrives while the count query is pending', fakeAsync(() => {
      let resolveCount!: (value: unknown) => void;
      let counts = 0;
      const list = page(REMINDER__INITIAL_QUERY_SIZE);

      eventService.list.and.callFake(((filter: { fragmentType?: string }) => {
        if (!filter.fragmentType) {
          return Promise.resolve({ data: list.map((r) => ({ ...r })), paging: {}, res: FETCH_RES });
        }
        counts++;

        return counts === 1
          ? new Promise((resolve) => (resolveCount = resolve))
          : Promise.resolve({ data: [], paging: { totalPages: 9 }, res: FETCH_RES });
      }) as never);

      void service.refresh();
      flushMicrotasks();
      // e.g. the due timer or an update invalidates the counter now
      service['counterOutdated'] = true;
      resolveCount({ data: [], paging: { totalPages: 5 }, res: FETCH_RES });
      flushMicrotasks();

      void service.refresh();
      flushMicrotasks();

      expect(counts).toBe(2);
      expect(service.reminderCounter()).toBe(9);
      service.destroy();
    }));

    it('keeps loading and notifies once when the shared record cannot be written', async () => {
      // the tab started before the fixture reminder became due
      service['announceFrom'] = Date.now() - 60_000;
      service.config.set({ toast: true });
      localStorageService.set.and.throwError('QuotaExceededError');

      await service.refresh();
      await service.refresh();

      expect(alertService.danger).not.toHaveBeenCalled();
      expect(service.lastLoaded()).toBeDefined();
      expect(alertService.add).toHaveBeenCalledTimes(1);
    });

    it('keeps loading and still toasts when browser notifications throw', async () => {
      const original = Object.getOwnPropertyDescriptor(window, 'Notification');

      Object.defineProperty(window, 'Notification', {
        value: function IllegalConstructor() {
          throw new TypeError('Illegal constructor');
        },
        configurable: true,
        writable: true,
      });
      // the tab started before the fixture reminder became due
      service['announceFrom'] = Date.now() - 60_000;
      service['hasNotificationPermission'] = true;
      service.config.set({ toast: true, browser: true });

      await service.refresh();

      expect(alertService.danger).not.toHaveBeenCalled();
      expect(alertService.add).toHaveBeenCalledTimes(1);
      if (original) Object.defineProperty(window, 'Notification', original);
    });

    it('reschedules the poll when a load starts in between', fakeAsync(() => {
      service['startPolling']();

      tick(REMINDER__POLL_INTERVAL_MS - 1_000);
      void service.refresh();
      flushMicrotasks();
      expect(eventService.list).toHaveBeenCalledTimes(1);

      // the poll that was due now was replaced by the load above
      tick(1_000);
      expect(eventService.list).toHaveBeenCalledTimes(1);

      tick(REMINDER__POLL_INTERVAL_MS);
      flushMicrotasks();
      expect(eventService.list).toHaveBeenCalledTimes(2);
      service.destroy();
    }));

    it('pushes the current list again on refreshView', () => {
      const previous = [makeReminder()];

      service.reminders.set(previous);
      service.refreshView();

      expect(service.reminders()).not.toBe(previous);
      expect(service.reminders()).toEqual(previous);
    });

    it('refreshes after a reminder update', async () => {
      const refreshSpy = spyOn(service, 'refresh').and.resolveTo();

      eventService.update.and.resolveTo({
        data: makeReminder(),
        res: FETCH_RES,
      });

      await service.update(makeReminder());

      expect(refreshSpy).toHaveBeenCalledTimes(1);
    });

    describe('due timer', () => {
      beforeEach(() => service.config.set({ toast: true }));

      it('announces a reminder known before its due time once', fakeAsync(() => {
        const time = new Date(Date.now() + 1_000).toISOString();

        serve(() => page(1, { time }));

        void service.refresh();
        flushMicrotasks();
        expect(service.reminderCounter()).toBe(0);
        const beforeDue = service.reminders();

        tick(1_000);
        expect(alertService.add).toHaveBeenCalledTimes(1);
        // a new array, so the drawer regroups
        expect(service.reminders()).not.toBe(beforeDue);
        // complete list: counted from memory, no extra request
        expect(service.reminderCounter()).toBe(1);
        expect(eventService.list).toHaveBeenCalledTimes(1);

        void service.refresh();
        flushMicrotasks();
        expect(alertService.add).toHaveBeenCalledTimes(1);
        service.destroy();
      }));

      it('refreshes the API counter at due time when the list is incomplete', fakeAsync(() => {
        let counter = 0;
        const time = new Date(Date.now() + 1_000).toISOString();

        serve(
          () => page(REMINDER__INITIAL_QUERY_SIZE, { time }),
          () => counter
        );

        void service.refresh();
        flushMicrotasks();
        expect(service.reminderCounter()).toBe(0);

        counter = 1;
        tick(1_000);
        flushMicrotasks();

        expect(countQueries()).toBe(2);
        expect(service.reminderCounter()).toBe(1);
        expect(alertService.add).toHaveBeenCalledTimes(1);
        service.destroy();
      }));

      it('re-arms and still announces when the timer fires early', fakeAsync(() => {
        const time = new Date(Date.now() + 1_000).toISOString();

        serve(() => page(1, { time }));

        void service.refresh();
        flushMicrotasks();
        // clock skew: the timer was armed for +1s, the reminder is due at +1.5s
        service.reminders()[0].time = new Date(Date.now() + 1_500).toISOString();

        tick(1_000);
        expect(alertService.add).not.toHaveBeenCalled();

        tick(500);
        expect(alertService.add).toHaveBeenCalledTimes(1);
        service.destroy();
      }));

      it('caps the timer at one day and announces after re-arming', fakeAsync(() => {
        const day = 24 * 60 * 60 * 1000;
        const time = new Date(Date.now() + 2 * day).toISOString();
        const timeouts = spyOn(window, 'setTimeout').and.callThrough();

        serve(() => page(1, { time }));

        void service.refresh();
        flushMicrotasks();
        expect(Math.max(...timeouts.calls.allArgs().map(([, delay]) => Number(delay)))).toBe(day);

        // fires early: neither announces nor requests
        tick(day);
        flushMicrotasks();
        expect(alertService.add).not.toHaveBeenCalled();
        expect(eventService.list).toHaveBeenCalledTimes(1);

        tick(day);
        expect(alertService.add).toHaveBeenCalledTimes(1);
        service.destroy();
      }));

      it('announces reminders created elsewhere that became due between two polls', fakeAsync(() => {
        serve(() => []);

        void service.refresh();
        flushMicrotasks();
        tick(1_000);

        // created by someone else after the first poll, already due at the second one
        const time = new Date(Date.now() - 500).toISOString();

        serve(() => page(1, { time }));
        void service.refresh();
        flushMicrotasks();

        expect(alertService.add).toHaveBeenCalledTimes(1);
        service.destroy();
      }));
    });
  });

  describe('tenant defaults', () => {
    it('applies tenant notification defaults when the user has no stored config', async () => {
      const privateService = service as unknown as ReminderServicePrivateForInit;

      spyOn(privateService, 'requestNotificationPermission').and.resolveTo(true);
      spyOn(privateService, 'fetchReminders').and.resolveTo({ reminders: [], complete: true });
      spyOn(privateService, 'fetchActiveReminderCounter').and.resolveTo(0);
      spyOn(privateService, 'setupConfigSubscription').and.callFake(() => undefined);
      spyOn(privateService, 'startPolling').and.callFake(() => undefined);
      localStorageService.getOrDefault.and.callFake((_key, fallback) => fallback);
      tenantOptionHelperService.getOptionsByCategory.and.resolveTo({ defaults: { toast: true } });

      await service.init();

      expect(service.config().toast).toBeTrue();
      expect(REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG.toast).not.toBeTrue();
    });
  });

  describe('announceDue()', () => {
    let due: string;
    let alertService: jasmine.SpyObj<AlertService>;

    beforeEach(() => {
      due = new Date(Date.now() - 1_000).toISOString();
      alertService = TestBed.inject(AlertService) as jasmine.SpyObj<AlertService>;
      activeTabService.isActive.and.returnValue(true);
      // as if the first load happened a while ago
      service['announceFrom'] = Date.now() - 10_000;
      service.reminders.set([
        makeReminder({ id: 'a', time: due }),
        makeReminder({ id: 'b', time: due, source: { id: 'device-2', name: 'Device 2' } }),
        makeReminder({ id: 'c', time: new Date(Date.now() + 60_000).toISOString() }),
      ]);
    });

    it('announces every due reminder once with a toast', () => {
      service.config.set({ toast: true });

      service['announceDue']();
      service['announceDue']();

      expect(alertService.add).toHaveBeenCalledTimes(2);
    });

    it('sends persistent browser notifications grouped per source with the type', () => {
      const created: [string, NotificationOptions][] = [];

      class FakeNotification {
        onclick: unknown;

        constructor(title: string, options: NotificationOptions) {
          created.push([title, options]);
        }

        close(): void {
          // not needed
        }
      }

      const original = Object.getOwnPropertyDescriptor(window, 'Notification');

      Object.defineProperty(window, 'Notification', {
        value: FakeNotification,
        configurable: true,
        writable: true,
      });

      service['hasNotificationPermission'] = true;
      service.config.set({ browser: true });
      service.reminders.set([makeReminder({ id: 'a', time: due, reminderType: 'type.a' })]);

      service['announceDue']();

      expect(created.length).toBe(1);

      const [title, options] = created[0];

      expect(title).toBe('Device 1');
      expect(options.requireInteraction).toBeTrue();
      expect(options.tag).toBe('reminder.due-device-1');
      expect(options.body).toContain('[type.a]');

      if (original) Object.defineProperty(window, 'Notification', original);
    });

    it('neither announces nor records in an inactive tab', () => {
      activeTabService.isActive.and.returnValue(false);
      service.config.set({ toast: true });

      service['announceDue']();
      expect(alertService.add).not.toHaveBeenCalled();
      expect(storage[REMINDER__LOCAL_STORAGE__ANNOUNCED]).toBeUndefined();

      // the tab becomes the active one: it announces what no tab announced yet
      activeTabService.isActive.and.returnValue(true);
      service['announceDue']();
      expect(alertService.add).toHaveBeenCalledTimes(2);
    });

    it('does not repeat what another tab announced', () => {
      const time = new Date(due).getTime();

      service.config.set({ toast: true });
      storage[REMINDER__LOCAL_STORAGE__ANNOUNCED] = { [`a@${time}`]: time, [`b@${time}`]: time };

      service['announceDue']();

      expect(alertService.add).not.toHaveBeenCalled();
    });

    it('records announcements for all tabs and drops expired entries', () => {
      const old = Date.now() - REMINDER__ANNOUNCE_WINDOW_MS - 1_000;
      const time = new Date(due).getTime();

      storage[REMINDER__LOCAL_STORAGE__ANNOUNCED] = { [`x@${old}`]: old };

      service['announceDue']();

      expect(storage[REMINDER__LOCAL_STORAGE__ANNOUNCED]).toEqual({
        [`a@${time}`]: time,
        [`b@${time}`]: time,
      });
    });

    it('does not announce reminders that were due before the tab started', () => {
      service.config.set({ toast: true });
      service['announceFrom'] = Date.now();

      service['announceDue']();

      expect(alertService.add).not.toHaveBeenCalled();
    });

    it('does not replay reminders due before the announcement window', () => {
      service.config.set({ toast: true });
      service['announceFrom'] = Date.now() - 60 * 60 * 1000;
      service.reminders.set([
        makeReminder({
          id: 'old',
          time: new Date(Date.now() - REMINDER__ANNOUNCE_WINDOW_MS - 1_000).toISOString(),
        }),
      ]);

      service['announceDue']();

      expect(alertService.add).not.toHaveBeenCalled();
    });

    it('announces only active reminders', () => {
      service.config.set({ toast: true });
      service.reminders.set([
        makeReminder({ id: 'ack', time: due, status: ReminderStatus.acknowledged }),
        makeReminder({ id: 'clr', time: due, status: ReminderStatus.cleared }),
      ]);

      service['announceDue']();

      expect(alertService.add).not.toHaveBeenCalled();
    });
  });
});
