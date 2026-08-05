import { inject, signal, ComponentRef, Injectable } from '@angular/core';
import { EventService, IEvent, IResult, TenantOptionsService } from '@c8y/client';
import { AlertService, EventRealtimeService, RealtimeMessage } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { filter as _filter, cloneDeep, debounce, has, orderBy, sortBy } from 'lodash';
import moment from 'moment';
import { Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { escapeHtml } from '~helpers/escape-html';
import { ActiveTabService } from '~services/active-tab.service';
import { AssetAccessService, AssetFilterConfig } from '~services/asset-access.service';
import { DomService } from '~services/dom.service';
import { LocalStorageService } from '~services/local-storage.service';
import { ReminderDrawerComponent } from '../components/reminder-drawer/reminder-drawer.component';
import {
  Reminder,
  REMINDER__INITIAL_QUERY_SIZE,
  REMINDER__LOCAL_STORAGE__CONFIG,
  REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG,
  REMINDER__TENANT_OPTION__CATEGORY,
  REMINDER__TENANT_OPTION__CONFIG_KEY,
  REMINDER__TENANT_OPTION__TYPE_KEY,
  REMINDER__TYPE,
  REMINDER__TYPE_FRAGMENT,
  ReminderConfig,
  ReminderGroup,
  ReminderGroupFilter,
  ReminderGroupStatus,
  ReminderStatus,
  ReminderTenantConfig,
  ReminderType,
  ResponsibilityFilter,
} from '../models/reminder.model';

@Injectable()
export class ReminderService {
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

  get types(): ReminderType[] {
    return this._types;
  }

  private hasNotificationPermission = false;
  private responsibilityIds: Set<string> = new Set();
  private responsibilityFilter: ResponsibilityFilter = { enabled: false };
  private drawer?: ReminderDrawerComponent;
  private drawerRef?: ComponentRef<unknown>;
  private updateTimer?: NodeJS.Timeout;

  private subscriptions = new Subscription();
  private debouncedSetUpdateTimer = debounce(() => this.setUpdateTimer(), 300);

  private _types: ReminderType[] = [];

  /**
   * Replaces the former `reminders` setter: updating the list also refreshes the
   * due counter and reschedules the update timer.
   */
  private setReminders(reminders: Reminder[]): void {
    this.reminders.set(reminders);
    this.updateCounter();
    this.debouncedSetUpdateTimer();
  }

  private alertService = inject(AlertService);

  private eventService = inject(EventService);

  private eventRealtimeService = inject(EventRealtimeService);

  private tenantOptionService = inject(TenantOptionsService);

  private translateService = inject(TranslateService);

  private localStorageService = inject(LocalStorageService);

  private activeTabService = inject(ActiveTabService);

  private domService = inject(DomService);

  private assetAccessService = inject(AssetAccessService);

  constructor() {
    this.activeTabService.init();
  }

  clear(): void {
    this.setReminders([]);
  }

  destroy() {
    if (this.drawerRef) this.domService.destroyComponent(this.drawerRef);
    this.subscriptions.unsubscribe();
  }

  /**
   * Initializes the ReminderService by loading configurations, fetching reminder types, and setting up subscriptions.
   * @returns {Promise<void>} A promise that resolves when initialization is complete.
   */
  async init(): Promise<void> {
    if (this.drawer) return;

    this.loadConfig();
    void this.requestNotificationPermission();
    const [tenantConfig, types] = await Promise.all([
      this.fetchTenantConfig(),
      this.fetchReminderTypes(),
    ]);

    this.contextFilterAvailable.set(tenantConfig.useContext ?? false);

    if (!this.contextFilterAvailable() && this.config().useContext) {
      this.setConfig('useContext', false);
    }

    // Initialize responsibility filter
    if (tenantConfig.responsibilityFilter?.enabled) {
      this.responsibilityFilter = tenantConfig.responsibilityFilter;
      this.responsibilityFilterEnabled.set(true);
      await this.loadResponsibilityIds();
    }

    this._types = types;
    this.createDrawer();
    this.setReminders(await this.fetchReminders(REMINDER__INITIAL_QUERY_SIZE));
    void this.fetchActiveReminderCounter();
    this.setupReminderSubscription();
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

  /**
   * Toggles the visibility of the reminder drawer.
   * @returns {void}
   */
  toggleDrawer(): void {
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

    return (await this.eventService.update(event)) as IResult<Reminder>;
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

  private deleteReminderFromList(
    message: Partial<RealtimeMessage<Reminder>>,
    reminders: Reminder[]
  ): Reminder | undefined {
    let deleted: Reminder | undefined;

    reminders = reminders.filter((r) => {
      if (r.id === message.data) {
        deleted = r;

        return false;
      } else {
        return true;
      }
    });

    if (deleted && deleted.status === ReminderStatus.active)
      this.reminderCounter.update((count) => count - 1);

    this.setReminders(this.digestReminders(reminders));

    return deleted;
  }

  private digestReminders(reminders: Reminder[]): Reminder[] {
    const now = moment();

    return reminders.map((reminder) => {
      reminder.diff = now.diff(reminder.time);

      return reminder;
    });
  }

  private async fetchTenantConfig(): Promise<ReminderTenantConfig> {
    try {
      const response = await this.tenantOptionService.detail({
        category: REMINDER__TENANT_OPTION__CATEGORY,
        key: REMINDER__TENANT_OPTION__CONFIG_KEY,
      });

      if (response.data?.value) {
        try {
          return this.parseJSON<ReminderTenantConfig>(response.data.value);
        } catch {
          this.alertService.add({
            type: 'danger',
            text: this.translateService.instant('reminder.error.invalidConfig') as string,
            timeout: 5000,
          });

          return {};
        }
      }
    } catch (error) {
      // A missing tenant option just means the context filter was never
      // configured; anything else is a real failure the user should see.
      if (!this.isNotFound(error)) {
        this.alertService.danger(
          this.translateService.instant('reminder.error.invalidConfig') as string,
          error as string
        );
      }
    }

    return {};
  }

  /** Distinguishes "tenant option not configured" from an actual request failure. */
  private isNotFound(error: unknown): boolean {
    const status =
      (error as { res?: { status?: number } } | null)?.res?.status ??
      (error as { status?: number } | null)?.status;

    return status === 404;
  }

  private async fetchReminderTypes(): Promise<ReminderType[]> {
    let types: ReminderType[] = [];

    try {
      const response = await this.tenantOptionService.detail({
        category: REMINDER__TENANT_OPTION__CATEGORY,
        key: REMINDER__TENANT_OPTION__TYPE_KEY,
      });

      if (response.data?.value)
        types = this.parseJSON<ReminderType[]>(response.data.value).map((type) => ({
          id: type.id,
          name: this.translateService.instant(type.name) as string,
        }));
    } catch (error) {
      // Reminder types are optional, so a missing option is not an error.
      if (!this.isNotFound(error)) {
        this.alertService.danger(
          this.translateService.instant('reminder.error.loadTypes') as string,
          error as string
        );
      }
    }

    return orderBy(types, 'name');
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

  private handleReminderUpdate(message: Partial<RealtimeMessage<Reminder>>): Reminder | undefined {
    let reminders = cloneDeep(this.reminders());
    const now = moment();

    if (message.realtimeAction === 'DELETE') return this.deleteReminderFromList(message, reminders);

    const reminder = this.digestReminders([message.data as Reminder])[0];

    switch (message.realtimeAction) {
      case 'UPDATE':
        reminders = this.reminders().map((r) => {
          if (r.id === reminder.id) r = reminder;

          return r;
        });
        // Apply responsibility filter before digest & counting
        reminders = this.applyResponsibilityFilter(reminders);
        void this.fetchActiveReminderCounter();
        break;
      case 'CREATE':
        reminders = [...reminders, reminder];
        // Apply responsibility filter before digest & counting
        reminders = this.applyResponsibilityFilter(reminders);
        // Only increment counter if reminder passed the responsibility filter
        if (
          reminders.some(
            (r) =>
              r.id === reminder.id && r.status === ReminderStatus.active && moment(r.time) <= now
          )
        )
          this.reminderCounter.update((count) => count + 1);
        break;
    }

    // update order & diff
    this.setReminders(this.digestReminders(reminders));

    return reminder;
  }

  // all reminders whos `time` is in the past and are still active
  private async fetchActiveReminderCounter(): Promise<number> {
    // When the responsibility filter is active the API total would include reminders outside the
    // user's responsibility scope. Count from the already-filtered in-memory list instead.
    if (this.responsibilityFilter.enabled) {
      const now = new Date().getTime();
      const counter = this.reminders().filter(
        (r) => r.status === ReminderStatus.active && new Date(r.time).getTime() <= now
      ).length;

      this.reminderCounter.set(counter);

      return counter;
    }

    let counter = 0;

    try {
      const response = await this.eventService.list({
        type: REMINDER__TYPE,
        pageSize: 1,
        fragmentType: 'status',
        fragmentValue: ReminderStatus.active,
        withTotalPages: true,
        dateFrom: '1970-01-01',
        dateTo: moment().toISOString(),
      });

      counter = response?.paging?.totalPages || 0;
    } catch (error) {
      this.alertService.danger(
        this.translateService.instant('reminder.error.load') as string,
        error as string
      );
    }

    this.reminderCounter.set(counter);

    return counter;
  }

  private async fetchReminders(pageSize: number, currentPage = 1): Promise<Reminder[]> {
    let reminders: Reminder[] = [];

    try {
      const response = await this.eventService.list({
        type: REMINDER__TYPE,
        withTotalPages: currentPage === 1,
        pageSize,
        currentPage,
      });

      reminders = response.data as Reminder[];
    } catch (error) {
      this.alertService.danger(
        this.translateService.instant('reminder.error.load') as string,
        error as string
      );
    }

    // Apply responsibility filter before digest & grouping
    reminders = this.applyResponsibilityFilter(reminders);

    return this.digestReminders(reminders);
  }

  private filterReminder(groups: ReminderGroup[], context?: string): ReminderGroup[] {
    // store filter setting to local storage
    const filter = this.buildTypeFilter();

    this.setConfig('filter', filter ?? undefined);

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
    this.config.set(
      this.localStorageService.getOrDefault<ReminderConfig>(
        REMINDER__LOCAL_STORAGE__CONFIG,
        REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG
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

  private sendNotification(reminder: Reminder): void {
    if (!this.activeTabService.isActive()) return;

    const config = this.config();

    if (config.browser) this.sendBrowserNotification(reminder);
    if (config.toast) this.sendToast(reminder);
  }

  private sendBrowserNotification(reminder: Reminder): void {
    if (!this.hasNotificationPermission) {
      // Expected when the user declined notifications; the toast still fires.
      return;
    }

    const notification: Notification = new Notification(`${reminder.source.name}`, {
      body: `[${this.translateService.instant('reminder.status.DUE')}] ${this.translateService.instant(reminder.text)}`,
      data: reminder,
      tag: 'reminder.due',
    });

    notification.addEventListener('click', () => {
      // `data` was read off the event target; the notification instance carries
      // the same payload and is properly typed.
      window.open(this.getAssetUrlFromReminder(reminder, true), '_blank');
      notification.close();
    });
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

  private setUpdateTimer(): void {
    const now = moment();

    clearTimeout(this.updateTimer);

    if (!this.reminders().length) return;

    const dueReminders = _filter(
      this.reminders(),
      (r) => r.status !== ReminderStatus.cleared && moment(r.time) > now
    );
    const closestReminder: Reminder = sortBy(dueReminders, 'time')[0];

    if (!closestReminder) return;

    // timeouts larger than 24.8 days result in immediate execution
    const diff = moment(closestReminder.time).diff(now);
    const timeout = diff > this.DAY_IN_MS ? this.DAY_IN_MS : diff;

    this.updateTimer = setTimeout(() => {
      this.setReminders(this.digestReminders(this.reminders()));
      this.sendNotification(closestReminder);
    }, timeout);
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

  private setupReminderSubscription(): void {
    this.subscriptions.add(
      this.eventRealtimeService
        .onAll$()
        .pipe(
          filter(
            (message) =>
              message.realtimeAction === 'DELETE' ||
              (has(message.data, 'type') && message.data['type'] === REMINDER__TYPE)
          ),
          map((message) => message as RealtimeMessage<Reminder>)
        )
        .subscribe((message) => this.handleReminderUpdate(message))
    );
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
    const now = new Date().getTime();
    let count = 0;
    let dueDate: number;

    this.reminders().forEach((reminder) => {
      dueDate = new Date(reminder.time).getTime();
      if (dueDate <= now && reminder.status === ReminderStatus.active) count++;
    });

    this.reminderCounter.set(count);
  }

  /**
   * Parses JSON, propagating malformed input to the caller. Returning `undefined`
   * while claiming `T` used to let invalid data flow on as a config object.
   */
  private parseJSON<T>(data: string): T {
    return JSON.parse(data) as T;
  }
}
