import { ComponentRef, inject, Injectable, OnDestroy, signal } from '@angular/core';
import { EventService, IEvent, IResult } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { has, orderBy, sortBy } from 'lodash';
import moment from 'moment';
import { Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { escapeHtml } from '~helpers/escape-html';
import { ActiveTabService } from '~services/active-tab.service';
import { AssetAccessService, AssetFilterConfig } from '~services/asset-access.service';
import { DomService } from '~services/dom.service';
import { LocalStorageService } from '~services/local-storage.service';
import { TenantOptionHelperService } from '~services/tenant-options-helper.service';
import { ReminderDrawerComponent } from '../components/reminder-drawer/reminder-drawer.component';
import {
  Reminder,
  REMINDER__ANNOUNCE_WINDOW_MS,
  REMINDER__COUNTER_MAX_AGE_MS,
  REMINDER__INITIAL_QUERY_SIZE,
  REMINDER__LOCAL_STORAGE__ANNOUNCED,
  REMINDER__LOCAL_STORAGE__CONFIG,
  REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG,
  REMINDER__POLL_INTERVAL_MS,
  REMINDER__REFRESH_MIN_INTERVAL_MS,
  REMINDER__TENANT_OPTION__CATEGORY,
  REMINDER__TYPE,
  REMINDER__TYPE_FRAGMENT,
  ReminderConfig,
  ReminderGroup,
  ReminderGroupFilter,
  ReminderGroupStatus,
  ReminderStatus,
  ReminderTenantConfig,
  ReminderTenantOptions,
  ReminderType,
  ResponsibilityFilter,
} from '../models/reminder.model';

@Injectable()
export class ReminderService implements OnDestroy {
  private alertService = inject(AlertService);
  private eventService = inject(EventService);
  private tenantOptionHelperService = inject(TenantOptionHelperService);
  private translateService = inject(TranslateService);
  private localStorageService = inject(LocalStorageService);
  private activeTabService = inject(ActiveTabService);
  private domService = inject(DomService);
  private assetAccessService = inject(AssetAccessService);

  readonly DAY_IN_MS = 24 * 60 * 60 * 1000;

  contextFilterAvailable = signal<boolean>(false);

  /**
   * Synchronous state, exposed as signals. These were `BehaviorSubject`s, which
   * forced `getValue()` reads in the service and manual subscriptions in every
   * consuming component. (`filters$` was declared but never read, and is gone.)
   */
  readonly config = signal<ReminderConfig>({});
  readonly open = signal(false);
  readonly reminders = signal<Reminder[]>([]);
  readonly reminderCounter = signal(0);
  readonly responsibilityFilterEnabled = signal(false);
  /** Time of the last successful load, shown in the drawer. */
  readonly lastLoaded = signal<Date | undefined>(undefined);

  get types(): ReminderType[] {
    return this._reminderTypes;
  }

  private hasNotificationPermission = false;
  private responsibilityIds: Set<string> = new Set();
  private responsibilityFilter: ResponsibilityFilter = { enabled: false };
  private drawer?: ReminderDrawerComponent;
  private drawerRef?: ComponentRef<unknown>;
  private updateTimer?: ReturnType<typeof setTimeout>;

  private subscriptions = new Subscription();

  private pollTimer?: ReturnType<typeof setTimeout>;
  private polling = false;
  private destroyed = false;
  private refreshInFlight?: Promise<void>;
  private refreshQueued = false;
  /** Alert once per failure streak, not on every poll. */
  private loadFailed = false;
  /** Start of the most recent load, successful or not (ms since epoch). */
  private lastLoadStartedAt = 0;
  /**
   * When this tab started. Reminders due before it are not announced, as they were
   * already due when the application was opened.
   */
  private announceFrom: number;
  /** Lower bound of the last announcement window; never moves back (clock changes). */
  private lastAnnounceWindowStart = 0;
  /** Announcements made by this tab, in case the shared record cannot be written. */
  private announcedHere = new Map<string, number>();
  /**
   * Content of each reminder as last loaded from the API, by id. Compared instead of
   * the live objects, which the drawer changes optimistically (`status`).
   */
  private loadedContent = new Map<string, string>();
  /** True when the last load returned fewer reminders than one page, i.e. all of them. */
  private listComplete = false;
  /** When the API due counter was last loaded (ms since epoch). */
  private counterLoadedAt = 0;
  /** Set when the API due counter must be reloaded with the next load. */
  private counterOutdated = true;
  private visibilityHandler = () => {
    if (document.visibilityState !== 'visible') return;
    // switching tabs back and forth must not send a request each time
    if (Date.now() - this.lastLoadStartedAt < REMINDER__REFRESH_MIN_INTERVAL_MS) return;

    void this.refresh();
  };

  private _reminderTypes: ReminderType[] = [];
  private _reminderTenantConfig: ReminderTenantConfig | null = null;
  // private _assetFilterConfig: AssetFilterConfig | null = null;
  private _reminderDefaults: ReminderConfig | null = null;

  constructor() {
    // The tab claims "active" right here, so it is responsible for announcing from now on.
    this.announceFrom = Date.now();
    this.activeTabService.init();
  }

  clear(): void {
    if (this.destroyed) return;

    this.setReminders([]);
    this.reminderCounter.set(0);
  }

  ngOnDestroy(): void {
    this.destroy();
  }

  destroy() {
    if (this.destroyed) return;

    this.destroyed = true;
    if (this.drawerRef) this.domService.destroyComponent(this.drawerRef);
    this.drawerRef = undefined;
    this.drawer = undefined;
    this.subscriptions.unsubscribe();
    this.stopPolling();
    clearTimeout(this.updateTimer);
  }

  /**
   * Reloads reminders and the due counter from the API. Concurrent calls share
   * the request in flight and trigger one follow-up load, because a request that
   * started before the caller's change may return stale data.
   * @returns {Promise<void>} A promise that resolves when the (first) load is complete.
   */
  refresh(): Promise<void> {
    if (this.destroyed) return Promise.resolve();

    if (this.refreshInFlight) {
      this.refreshQueued = true;

      return this.refreshInFlight;
    }

    // a load now replaces the scheduled poll; it is rescheduled when the load completes
    clearTimeout(this.pollTimer);
    this.refreshInFlight = this.loadReminders().finally(() => {
      this.refreshInFlight = undefined;

      if (this.refreshQueued) {
        this.refreshQueued = false;
        void this.refresh();
      } else {
        this.schedulePoll();
      }
    });

    return this.refreshInFlight;
  }

  /**
   * Pushes the current list again, so views re-render local changes to the reminder
   * objects (e.g. an optimistic status change the drawer reverted).
   */
  refreshView(): void {
    if (this.destroyed) return;

    this.setReminders([...this.reminders()]);
  }

  /**
   * Initializes the ReminderService by loading configurations, fetching reminder types, and setting up subscriptions.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  async init(): Promise<void> {
    if (this.drawer || this.destroyed) return;

    await this.fetchTenantOptions();
    // `destroy()` may run while any of the requests below is pending
    if (this.destroyed) return;
    this.loadConfig();
    this.hasNotificationPermission =
      'Notification' in window && Notification.permission === 'granted';

    if (this.config().browser && !this.hasNotificationPermission) {
      this.setConfig('browser', false);
    }

    this.contextFilterAvailable.set(this._reminderTenantConfig?.useContext ?? false);

    if (!this.contextFilterAvailable() && this.config().useContext) {
      this.setConfig('useContext', false);
    }

    // Initialize responsibility filter
    if (this._reminderTenantConfig?.responsibilityFilter?.enabled) {
      this.responsibilityFilter = this._reminderTenantConfig?.responsibilityFilter;
      this.responsibilityFilterEnabled.set(true);
      await this.loadResponsibilityIds();
      if (this.destroyed) return;
    }

    await this.refresh();
    if (this.destroyed) return;
    this.startPolling();
    this.setupConfigSubscription();
  }

  /**
   * Retrieves the name of a reminder type based on its ID.
   * @param {ReminderType['id']} reminderTypeID - The ID of the reminder type.
   * @returns {ReminderType['name']} The name of the reminder type, or 'Unknown' if not found.
   */
  getReminderTypeName(reminderTypeID: ReminderType['id']): ReminderType['name'] {
    const type = this.types.find((t) => t.id === reminderTypeID);

    return type ? type.name : ReminderStatus.unknown;
  }

  /**
   * Groups reminders into categories: due, upcoming, and cleared.
   * @param {Reminder[]} reminders - The list of reminders to group.
   * @param {string} [context] - Optional context for filtering reminders.
   * @returns {ReminderGroup[]} An array of grouped reminders.
   */
  groupReminders(reminders: Reminder[], context?: string): ReminderGroup[] {
    let dueDate: number;
    const now = new Date().getTime();
    const cleared: ReminderGroup = {
      status: ReminderGroupStatus.cleared,
      count: 0,
      reminders: [],
    };
    const due: ReminderGroup = {
      status: ReminderGroupStatus.due,
      count: 0,
      reminders: [],
    };
    const upcoming: ReminderGroup = {
      status: ReminderGroupStatus.upcoming,
      count: 0,
      reminders: [],
    };

    if (reminders.length === 0) return [due, upcoming, cleared];

    // splitting into groups
    reminders.forEach((reminder) => {
      dueDate = new Date(reminder.time).getTime();

      if (reminder.status === ReminderStatus.cleared) {
        cleared.reminders.push(reminder);
        cleared.count++;
      } else if (dueDate <= now) {
        due.reminders.push(reminder);
        due.count++;
      } else {
        upcoming.reminders.push(reminder);
        upcoming.count++;
      }
    });

    return this.filterReminder(this.sortReminder(due, upcoming, cleared), context);
  }

  /**
   * Resets the filter configuration by removing the current filter.
   * @returns {void}
   */
  resetFilterConfig(): void {
    // A new object rather than a mutated one: signals compare by reference, so
    // mutating in place would not notify subscribers.
    const { filter: _removed, ...rest } = this.config();

    this.config.set(rest);
  }

  /**
   * Updates the configuration with a new key-value pair.
   * @param {string} key - The configuration key to update.
   * @param value - The value to set for the configuration key.
   * @returns {void}
   */
  setConfig<K extends keyof ReminderConfig>(key: K, value: ReminderConfig[K]): void {
    const config = { ...this.config(), [key]: value };

    this.localStorageService.set(REMINDER__LOCAL_STORAGE__CONFIG, config);
    this.config.set(config);
  }

  async setBrowserNotifications(enabled: boolean): Promise<void> {
    const permissionGranted = enabled ? await this.requestNotificationPermission() : false;

    this.setConfig('browser', enabled && permissionGranted);
  }

  /**
   * Toggles the visibility of the reminder drawer.
   * @returns {void}
   */
  toggleDrawer(): void {
    if (!this.drawer) this.createDrawer();
    this.drawer?.toggleDrawer();
  }

  /**
   * Updates a reminder's status and clears its `isCleared` fragment if applicable.
   * @param {Reminder} reminder - The reminder to update.
   * @returns {Promise<IResult<Reminder>>} A promise that resolves with the updated reminder result.
   */
  async update(reminder: Reminder): Promise<IResult<Reminder>> {
    const event: Partial<IEvent> = {
      id: reminder.id,
      status: reminder.status,
    };

    // (un)set `isCleared` fragment to support using retention rules for cleared reminders
    event.isCleared = reminder.status === ReminderStatus.cleared ? {} : null;

    const result = (await this.eventService.update(event)) as IResult<Reminder>;

    // the reminder may be outside the first page, so the list alone may not change
    this.counterOutdated = true;

    // reminders are polled, so pull the change (and the new counter) in right away
    void this.refresh();

    return result;
  }

  private applyContextFilter(groups: ReminderGroup[], context?: string): ReminderGroup[] {
    const config = this.config();

    if (!Object.hasOwn(config, 'useContext') || !config.useContext || !context) return groups;

    groups.forEach((group) => {
      group.total = group.reminders.length;
      group.reminders = group.reminders.filter((reminder) => reminder.source.id === context);
      group.count = group.reminders.length;
    });

    return groups;
  }

  private applyResponsibilityFilter(reminders: Reminder[]): Reminder[] {
    if (!this.responsibilityFilter.enabled || this.responsibilityIds.size === 0) return reminders;

    const fragment: string = this.responsibilityFilter.fragment ?? 'c8y_Hierarchy';

    return reminders.filter((reminder) => {
      const hierarchyValue = reminder[fragment] as unknown;

      // Show reminders without the fragment
      if (!hierarchyValue || !Array.isArray(hierarchyValue) || hierarchyValue.length === 0) {
        return true;
      }

      // Check if any responsibility ID matches any ID in the hierarchy
      return hierarchyValue.some((id) => this.responsibilityIds.has(id as string));
    });
  }

  private applyReminderFilter(reminder: Reminder, filters: ReminderGroupFilter): boolean {
    const keys = Object.keys(filters);

    if (!keys.length) return true;

    return keys.every((key) => reminder[key] === filters[key]);
  }

  private buildTypeFilter(): ReminderGroupFilter | null {
    const filters: ReminderGroupFilter = {};
    const config = this.config();

    // populate filters
    if (config.filter && Object.hasOwn(config.filter, 'reminderType'))
      filters[REMINDER__TYPE_FRAGMENT] = config.filter[REMINDER__TYPE_FRAGMENT];

    return Object.keys(filters).length > 0 ? filters : null;
  }

  private createDrawer() {
    this.drawerRef = this.domService.appendComponentToBody(ReminderDrawerComponent);
    this.drawer = this.drawerRef.instance as ReminderDrawerComponent;
    // The drawer owns its open state; mirror it into the service signal.
    this.open.set(this.drawer.open());
    this.drawer.openChange.subscribe((open) => this.open.set(open));
  }

  private digestReminders(reminders: Reminder[]): Reminder[] {
    const now = moment();

    return reminders.map((reminder) => {
      reminder.diff = now.diff(reminder.time);

      return reminder;
    });
  }

  private async fetchTenantOptions(): Promise<void> {
    const options =
      await this.tenantOptionHelperService.getOptionsByCategory<ReminderTenantOptions>(
        REMINDER__TENANT_OPTION__CATEGORY
      );

    this._reminderTypes = orderBy(options.types ?? [], 'name');
    this._reminderTenantConfig = options.config ?? null;
    // this._assetFilterConfig = options.assetFilter ?? null;
    this._reminderDefaults = options.defaults ?? null;
  }

  private async loadResponsibilityIds(): Promise<void> {
    this.responsibilityIds.clear();

    if (!this.responsibilityFilter.method) return;

    const { method, endpoint, managedObjectId, fragment, query, cacheTtl } =
      this.responsibilityFilter;
    const assetFilterConfig: AssetFilterConfig = {
      method,
      endpoint,
      managedObjectId,
      fragment,
      query,
      cacheTtl,
    };

    try {
      const ids = await this.assetAccessService.getAssetIdsFromConfigAsync(assetFilterConfig);

      ids.forEach((id) => this.responsibilityIds.add(id));
    } catch (error) {
      // Without the responsibility list the filter would silently hide reminders,
      // so tell the user rather than showing an incomplete list as if it were complete.
      this.alertService.danger(
        this.translateService.instant('reminder.error.responsibilityFilter') as string,
        error as string
      );
    }
  }

  private getAssetUrlFromReminder(reminder: Reminder, absoluteUrl = false): string {
    let url = '';

    if (absoluteUrl) {
      url = `${location.origin}${location.pathname}${location.search}#`;
    }

    const assetType = reminder.isGroup ? 'group' : 'device';

    url += `/${assetType}/${reminder.source.id}`;

    return url;
  }

  /**
   * Counts all reminders whose `time` is in the past and that are still active, via
   * the API. Throws on API errors.
   * @returns {Promise<number>} The total across all pages.
   */
  private async fetchActiveReminderCounter(): Promise<number> {
    const response = await this.eventService.list({
      type: REMINDER__TYPE,
      pageSize: 1,
      fragmentType: 'status',
      fragmentValue: ReminderStatus.active,
      withTotalPages: true,
      dateFrom: '1970-01-01',
      dateTo: moment().toISOString(),
    });

    return response?.paging?.totalPages || 0;
  }

  /**
   * Throws on API errors, so a failed poll cannot replace the list with an empty one.
   * @returns {Promise<{ reminders: Reminder[]; complete: boolean }>} The reminders after
   * the responsibility filter, and whether the API returned less than a full page.
   */
  private async fetchReminders(
    pageSize: number,
    currentPage = 1
  ): Promise<{ reminders: Reminder[]; complete: boolean }> {
    // no `withTotalPages`: the total is never read, and it costs an extra count query per poll
    const response = await this.eventService.list({
      type: REMINDER__TYPE,
      pageSize,
      currentPage,
    });
    const data = response.data as Reminder[];

    // Apply responsibility filter before digest & grouping
    const reminders = this.applyResponsibilityFilter(data);

    return { reminders: this.digestReminders(reminders), complete: data.length < pageSize };
  }

  private async loadReminders(): Promise<void> {
    const startedAt = Date.now();

    this.lastLoadStartedAt = startedAt;

    try {
      const { reminders: fetched, complete } = await this.fetchReminders(
        REMINDER__INITIAL_QUERY_SIZE
      );

      if (this.destroyed) return;

      const previous = this.reminders();
      const reminders = this.reuseUnchanged(previous, fetched);
      const changed = reminders !== previous;

      this.listComplete = complete;
      // Only a changed list is pushed, so an unchanged poll neither re-renders nor reschedules.
      if (changed) this.setReminders(reminders);
      this.announceDue();

      if (this.countsFromMemory()) {
        this.reminderCounter.set(this.countDueReminders());
      } else if (
        changed ||
        this.counterOutdated ||
        startedAt - this.counterLoadedAt >= REMINDER__COUNTER_MAX_AGE_MS
      ) {
        // The count query scans all reminder events of the tenant: only when needed.
        // Cleared before the request, so an invalidation while it is pending (due
        // timer, update) is kept for the next load.
        this.counterOutdated = false;

        let counter: number;

        try {
          counter = await this.fetchActiveReminderCounter();
        } catch (error) {
          this.counterOutdated = true;
          throw error;
        }

        if (this.destroyed) return;

        this.reminderCounter.set(counter);
        this.counterLoadedAt = startedAt;
      }

      this.lastLoaded.set(new Date());
      this.loadFailed = false;
    } catch (error) {
      if (this.destroyed) return;

      // Keep the current list; the next poll retries. The due timer keeps announcing.
      if (!this.loadFailed) {
        this.alertService.danger(
          this.translateService.instant('reminder.error.load') as string,
          error as string
        );
      }
      this.loadFailed = true;
    }
  }

  /**
   * Keeps the existing object for every reminder whose content in the API did not
   * change. The drawer renders those objects and the due timer updates their `diff`,
   * so replacing them on every poll would leave the drawer showing stale copies.
   * Comparing against the previously loaded content (not the live object) keeps an
   * optimistic status change by the drawer until the API reports a real change.
   * @returns {Reminder[]} `previous` itself when nothing changed, otherwise a new array.
   */
  private reuseUnchanged(previous: Reminder[], fetched: Reminder[]): Reminder[] {
    const known = new Map(previous.map((reminder) => [reminder.id, reminder]));
    let changed = previous.length !== fetched.length;

    const reminders = fetched.map((reminder, index) => {
      const existing = known.get(reminder.id);

      if (!existing || this.loadedContent.get(String(reminder.id)) !== this.contentKey(reminder)) {
        changed = true;

        return reminder;
      }

      // becoming due regroups the reminder in the drawer
      if (this.isDue(existing) !== this.isDue(reminder)) changed = true;
      if (previous[index] !== existing) changed = true;
      existing.diff = reminder.diff;

      return existing;
    });

    this.loadedContent = new Map(fetched.map((r) => [String(r.id), this.contentKey(r)]));

    return changed ? reminders : previous;
  }

  /** Stored content of a reminder, without the fields that are only set locally. */
  private contentKey(reminder: Reminder): string {
    const { diff: _diff, changed: _changed, ...stored } = reminder;

    return JSON.stringify(stored);
  }

  private isDue(reminder: Reminder): boolean {
    return (reminder.diff ?? -1) >= 0;
  }

  /**
   * The single place that decides which reminders to announce, used by the due
   * timer and by every poll. Announces each active reminder that is due, became due
   * within `REMINDER__ANNOUNCE_WINDOW_MS` (and after the first load attempt), and was
   * not announced yet by any tab. This covers:
   * - a timer firing slightly early or late (the next run or poll catches up),
   * - reminders created elsewhere that are already due when a poll brings them,
   * - a tab resuming after a pause (sleep, throttled timers): nothing older is replayed.
   * Only the active tab announces and records; the record is shared by all tabs via
   * local storage, so switching tabs neither repeats nor drops a notification.
   */
  private announceDue(): void {
    if (!this.activeTabService.isActive()) return;

    const now = Date.now();
    const from = Math.max(
      this.announceFrom,
      now - REMINDER__ANNOUNCE_WINDOW_MS,
      this.lastAnnounceWindowStart
    );

    this.lastAnnounceWindowStart = from;

    const shared = this.localStorageService.getOrDefault<Record<string, number>>(
      REMINDER__LOCAL_STORAGE__ANNOUNCED,
      {}
    );
    const isAnnounced = (key: string) => Object.hasOwn(shared, key) || this.announcedHere.has(key);
    const due = this.reminders().filter((reminder) => {
      const time = new Date(reminder.time).getTime();

      return (
        reminder.status === ReminderStatus.active &&
        time > from &&
        time <= now &&
        !isAnnounced(`${reminder.id}@${time}`)
      );
    });
    const expired = (time: number) => time <= now - REMINDER__ANNOUNCE_WINDOW_MS;

    this.announcedHere.forEach((time, key) => {
      if (expired(time)) this.announcedHere.delete(key);
    });

    if (!due.length) return;

    // keep only entries that can still match, plus the new ones
    const record: Record<string, number> = {};

    Object.entries(shared).forEach(([key, time]) => {
      if (!expired(time)) record[key] = time;
    });
    due.forEach((reminder) => {
      const time = new Date(reminder.time).getTime();
      const key = `${reminder.id}@${time}`;

      record[key] = time;
      this.announcedHere.set(key, time);
    });

    // A full storage must not fail the load.
    try {
      this.localStorageService.set(REMINDER__LOCAL_STORAGE__ANNOUNCED, record);
    } catch {
      // other tabs may announce again; this tab still remembers via `announcedHere`
    }

    this.notify(due);
  }

  /**
   * The counter can be computed from the list when the list is complete, or when the
   * responsibility filter applies (the API total would include reminders outside
   * the user's responsibility).
   */
  private countsFromMemory(): boolean {
    return this.responsibilityFilter.enabled || this.listComplete;
  }

  /** Counts active reminders whose `time` has passed, from the in-memory list. */
  private countDueReminders(): number {
    const now = new Date().getTime();

    return this.reminders().filter(
      (reminder) =>
        reminder.status === ReminderStatus.active && new Date(reminder.time).getTime() <= now
    ).length;
  }

  private filterReminder(groups: ReminderGroup[], context?: string): ReminderGroup[] {
    const filter = this.buildTypeFilter();
    const config = this.config();

    groups = this.applyContextFilter(groups, context);

    // type filter
    if (
      !filter ||
      !config?.filter ||
      !Object.hasOwn(config.filter, 'reminderType') ||
      filter[REMINDER__TYPE_FRAGMENT] === ''
    )
      return groups;

    const keys = Object.keys(filter);

    if (!keys.length) return groups;

    groups.forEach((group) => {
      group.reminders = group.reminders.filter((reminder) =>
        this.applyReminderFilter(reminder, filter)
      );
      if (!Object.hasOwn(group, 'total') || (group.total ?? 0) > group.count)
        group.total = group.count;
      group.count = group.reminders.length;
    });

    return groups;
  }

  private loadConfig(): void {
    // copy: the tenant defaults must not leak into the shared constant
    const defaults = { ...REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG };

    if (this._reminderDefaults) {
      if (this._reminderDefaults.browser) defaults.browser = this._reminderDefaults.browser;
      if (this._reminderDefaults.toast) defaults.toast = this._reminderDefaults.toast;
    }

    this.config.set(
      this.localStorageService.getOrDefault<ReminderConfig>(
        REMINDER__LOCAL_STORAGE__CONFIG,
        defaults
      )
    );
  }

  private async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      // Not an error: the browser simply does not support notifications.
      return false;
    }

    const response = await Notification.requestPermission();

    return (this.hasNotificationPermission = response === 'granted');
  }

  private notify(reminders: Reminder[]): void {
    const config = this.config();

    reminders.forEach((r) => {
      if (config.browser) {
        try {
          this.sendBrowserNotification(r);
        } catch {
          // e.g. `new Notification()` is an illegal constructor on Android Chrome;
          // must not fail the load or skip the remaining notifications
        }
      }
      if (config.toast) this.sendToast(r);
    });
  }

  private buildBrowserNotificationOptions(reminder: Reminder): NotificationOptions {
    let body = `[${this.translateService.instant('reminder.status.DUE')}] ${this.translateService.instant(reminder.text)}`;

    if (reminder.reminderType) body += ` [${this.translateService.instant(reminder.reminderType)}]`;

    return {
      body,
      requireInteraction: true,
      data: reminder,
      tag: `reminder.due-${reminder.source.id}`, // group in notification center by this tag
    };
  }

  private sendBrowserNotification(reminder: Reminder): void {
    if (!this.hasNotificationPermission) {
      // Expected when the user declined notifications; the toast still fires.
      return;
    }

    const notification = new Notification(
      `${reminder.source.name}`,
      this.buildBrowserNotificationOptions(reminder)
    );

    notification.onclick = () => {
      // `data` was read off the event target; the notification instance carries
      // the same payload and is properly typed.
      window.open(this.getAssetUrlFromReminder(reminder, true), '_blank');
      notification.close();
    };
  }

  private sendToast(reminder: Reminder): void {
    const url = this.getAssetUrlFromReminder(reminder);
    // `[c8yIcon]` is an Angular binding and inert in a raw HTML string; the icon
    // has to be applied as a plain class here.
    const icon = `<i class="${reminder.isGroup ? 'dlt-c8y-icon-group-open' : 'dlt-c8y-icon-device'}"></i>`;
    // `source.name` and `text` are platform data, so they must be escaped before
    // going into an `allowHtml` alert.
    const name = escapeHtml(reminder.source.name ?? '');
    const text = escapeHtml(this.translateService.instant(reminder.text) as string);

    this.alertService.add({
      type: 'warning',
      text: `<a href="#${encodeURI(url)}" class="full-click">${icon} ${name}</a><br />
        <small>[${this.translateService.instant('reminder.status.DUE')}] ${text}</small>`,
      allowHtml: true,
    });
  }

  /**
   * Replaces the former `reminders` setter: updating the list also reschedules the
   * due timer and, when the counter is computed from the list, recounts.
   */
  private setReminders(reminders: Reminder[]): void {
    this.reminders.set(reminders);
    if (this.countsFromMemory()) this.updateCounter();
    this.setUpdateTimer();
  }

  /** Wakes up when the next not-cleared reminder becomes due (it changes groups then). */
  private setUpdateTimer(): void {
    clearTimeout(this.updateTimer);

    if (this.destroyed) return;

    const now = Date.now();
    const next = this.reminders()
      .filter((r) => r.status !== ReminderStatus.cleared)
      .map((r) => new Date(r.time).getTime())
      .filter((time) => time > now)
      .sort((a, b) => a - b)[0];

    if (next === undefined) return;

    // timeouts larger than 24.8 days result in immediate execution
    const timeout = Math.min(next - now, this.DAY_IN_MS);

    this.updateTimer = setTimeout(() => this.onDueTimer(next), timeout);
  }

  /** @param dueAt - The due time the timer was armed for. */
  private onDueTimer(dueAt: number): void {
    // New array with updated `diff`: the drawer regroups the reminders that became due.
    // This also re-arms the timer, including when it fired early (1-day cap, clock skew).
    this.setReminders(this.digestReminders(this.reminders()));
    this.announceDue();

    // a reminder became due: the API due counter changed as well
    if (Date.now() >= dueAt && !this.countsFromMemory()) {
      this.counterOutdated = true;
      void this.refresh();
    }
  }

  private setupConfigSubscription(): void {
    this.subscriptions.add(
      this.localStorageService.storage$
        .pipe(
          map((config) => {
            if (!has(config, REMINDER__LOCAL_STORAGE__CONFIG)) return undefined;

            try {
              return this.parseJSON<ReminderConfig>(
                config[REMINDER__LOCAL_STORAGE__CONFIG] as string
              );
            } catch {
              // Corrupt local storage must not tear down the subscription;
              // the previous config stays in effect.
              return undefined;
            }
          }),
          filter((config): config is ReminderConfig => config !== undefined)
        )
        .subscribe((config) => this.config.set(config))
    );
  }

  /**
   * Polls instead of subscribing to `/events/*`: that realtime channel cannot be
   * filtered by type and carries every event of the tenant. Each message runs a
   * full change detection cycle (Angular and AngularJS), which saturated the CPU
   * on busy tenants (~100 messages/s, none of them reminders).
   * Polling continues in background tabs, as the last focused tab sends the notifications.
   */
  private startPolling(): void {
    if (this.polling || this.destroyed) return;

    this.polling = true;
    document.addEventListener('visibilitychange', this.visibilityHandler);
    this.schedulePoll();
  }

  private stopPolling(): void {
    this.polling = false;
    clearTimeout(this.pollTimer);
    document.removeEventListener('visibilitychange', this.visibilityHandler);
  }

  private schedulePoll(): void {
    clearTimeout(this.pollTimer);

    if (!this.polling) return;

    this.pollTimer = setTimeout(() => void this.refresh(), REMINDER__POLL_INTERVAL_MS);
  }

  private sortReminder(
    due: ReminderGroup,
    upcoming: ReminderGroup,
    cleared: ReminderGroup
  ): ReminderGroup[] {
    due.reminders = sortBy(due.reminders, ['time']).reverse();
    upcoming.reminders = sortBy(upcoming.reminders, ['time']);
    cleared.reminders = sortBy(cleared.reminders, ['lastUpdated']).reverse();

    return [due, upcoming, cleared];
  }

  private updateCounter(): void {
    this.reminderCounter.set(this.countDueReminders());
  }

  /**
   * Parses JSON, propagating malformed input to the caller. Returning `undefined`
   * while claiming `T` used to let invalid data flow on as a config object.
   */
  private parseJSON<T>(data: string): T {
    return JSON.parse(data) as T;
  }
}
