import { ComponentRef, Injectable } from '@angular/core';
import {
  EventService,
  IEvent,
  IResult,
  TenantOptionsService,
} from '@c8y/client';
import {
  AlertService,
  EventRealtimeService,
  RealtimeMessage,
} from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { cloneDeep, filter as _filter, has, orderBy, sortBy } from 'lodash';
import moment from 'moment';
import { BehaviorSubject, Subscription } from 'rxjs';
import { filter, map } from 'rxjs/operators';
import { ReminderDrawerComponent } from '../components/reminder-drawer/reminder-drawer.component';
import {
  Reminder,
  ReminderConfig,
  ReminderGroup,
  ReminderGroupFilter,
  ReminderGroupStatus,
  ReminderStatus,
  ReminderType,
  REMINDER_INITIAL_QUERY_SIZE,
  REMINDER_LOCAL_STORAGE_CONFIG,
  REMINDER_LOCAL_STORAGE_DEFAULT_CONFIG,
  REMINDER_TENENAT_OPTION_CATEGORY,
  REMINDER_TENENAT_OPTION_TYPE_KEY,
  REMINDER_TYPE,
  REMINDER_TYPE_FRAGMENT,
} from '../reminder.model';
import { ActiveTabService } from './active-tab.service';
import { DomService } from './dom.service';
import { LocalStorageService } from './local-storage.service';

@Injectable()
export class ReminderService {
  config$ = new BehaviorSubject<ReminderConfig>({});
  filters$ = new BehaviorSubject<ReminderGroupFilter>({});
  open$?: BehaviorSubject<boolean>;
  reminders$ = new BehaviorSubject<Reminder[]>([]);
  reminderCounter$ = new BehaviorSubject<number>(0);

  get types(): ReminderType[] {
    return this._types;
  }

  private hasNotificationPermission = false;
  private subscriptions = new Subscription();
  private drawer?: ReminderDrawerComponent;
  private drawerRef?: ComponentRef<unknown>;
  private updateTimer?: NodeJS.Timeout;

  private _reminderCounter = 0;
  private _reminders: Reminder[] = [];
  private _types: ReminderType[] = [];

  private get reminderCounter(): number {
    return this._reminderCounter;
  }
  private set reminderCounter(count: number) {
    this._reminderCounter = count;
    this.reminderCounter$.next(this._reminderCounter);
  }

  private get reminders(): Reminder[] {
    return this._reminders;
  }
  private set reminders(reminders: Reminder[]) {
    this._reminders = reminders;
    this.reminders$.next(this._reminders);
    this.updateCounter();
    this.setUpdateTimer();
  }

  constructor(
    private activeTabService: ActiveTabService,
    private alertService: AlertService,
    private domService: DomService,
    private eventService: EventService,
    private eventRealtimeService: EventRealtimeService,
    private localStorageService: LocalStorageService,
    private tenantOptionService: TenantOptionsService,
    private translateService: TranslateService
  ) {
    this.activeTabService.init();
  }

  clear(): void {
    this.reminders = [];
  }

  destroy() {
    if (this.drawerRef) this.domService.destroyComponent(this.drawerRef);
    this.subscriptions.unsubscribe();
  }

  async init(): Promise<void> {
    if (this.drawer) return;

    this.loadConfig();
    this.requestNotificationPermission();
    this._types = await this.fetchReminderTypes();
    void this.fetchActiveReminderCounter();
    this.createDrawer();
    this.reminders = await this.fetchReminders(REMINDER_INITIAL_QUERY_SIZE);
    this.setupReminderSubscription();
    this.setupConfigSubscription();
  }

  getReminderTypeName(
    reminderTypeID: ReminderType['id']
  ): ReminderType['name'] {
    const type = this.types.find((t) => t.id === reminderTypeID);

    return type ? type.name : 'Unknown';
  }

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

    return this.filterReminder(
      this.sortReminder(due, upcoming, cleared),
      context
    );
  }

  resetFilterConfig(): void {
    const config = this.config$.getValue();
    delete config.filter;
    this.config$.next(config);
  }

  setConfig(key: string, value: any): void {
    const config = this.config$.getValue();
    config[key] = value;
    this.localStorageService.set(REMINDER_LOCAL_STORAGE_CONFIG, config);
    this.config$.next(config);
  }

  toggleDrawer() {
    this.drawer?.toggleDrawer();
  }

  async update(reminder: Reminder): Promise<IResult<Reminder>> {
    const event: Partial<IEvent> = {
      id: reminder.id,
      status: reminder.status,
    };

    // (un)set `isCleared` fragment to supoprt using retention rules for cleared reminders
    event.isCleared = reminder.status === ReminderStatus.cleared ? {} : null;

    return (await this.eventService.update(event)) as IResult<Reminder>;
  }

  private applyContextFilter(
    groups: ReminderGroup[],
    context?: string
  ): ReminderGroup[] {
    const config = this.config$.getValue();

    if (!has(config, 'useContext') || !config.useContext || !context)
      return groups;

    groups.map((group) => {
      group.total = group.reminders.length;
      group.reminders = group.reminders.filter(
        (reminder) => reminder.source.id === context
      );
      group.count = group.reminders.length;

      return group;
    });

    return groups;
  }

  private applyReminderFilter(
    reminder: Reminder,
    filters: ReminderGroupFilter
  ): Reminder {
    const keys = Object.keys(filters);
    if (!keys.length) return reminder;

    let check = true;
    keys.forEach((key) => {
      if (reminder[key] !== filters[key]) check = false;
    });

    if (!check) return;
    return reminder;
  }

  private buildTypeFilter(): ReminderGroupFilter {
    const filters: ReminderGroupFilter = {};
    const config = this.config$.getValue();

    // populate filters
    if (has(config.filter, 'reminderType'))
      filters[REMINDER_TYPE_FRAGMENT] = config.filter[REMINDER_TYPE_FRAGMENT];

    return Object.keys(filters).length > 0 ? filters : null;
  }

  private createDrawer() {
    this.drawerRef = this.domService.appendComponentToBody(
      ReminderDrawerComponent
    );
    this.drawer = this.drawerRef.instance as ReminderDrawerComponent;
    this.open$ = this.drawer.open$;
  }

  private deleteRminderFromList(
    message: Partial<RealtimeMessage<Reminder>>,
    reminders: Reminder[]
  ): Reminder | undefined {
    let deleted: Reminder | undefined;

    reminders = reminders.filter((r) => {
      if (r.id === message.data) {
        deleted = r as Reminder;

        return false;
      } else {
        return true;
      }
    });

    if (deleted && deleted.status === ReminderStatus.active)
      this.reminderCounter--;

    this.reminders = this.digestReminders(reminders);

    return deleted;
  }

  private digestReminders(reminders: Reminder[]): Reminder[] {
    const now = moment();

    return reminders.map((reminder) => {
      reminder.diff = now.diff(reminder.time);

      return reminder;
    });
  }

  private async fetchReminderTypes(): Promise<ReminderType[]> {
    let types: ReminderType[] = [];

    try {
      const response = await this.tenantOptionService.detail({
        category: REMINDER_TENENAT_OPTION_CATEGORY,
        key: REMINDER_TENENAT_OPTION_TYPE_KEY,
      });

      if (response.data)
        types = (JSON.parse(response.data.value) as ReminderType[]).map(
          (type) => ({
            id: type.id,
            name: this.translateService.instant(type.name),
          })
        );
    } catch (error) {
      console.log('[R.S:1] No reminder type config found.', error);
    }

    return orderBy(types, 'name');
  }

  private getAssetUrlFromReminder(
    reminder: Reminder,
    absoluteUrl = false
  ): string {
    let url = '';

    if (absoluteUrl) {
      url = `${location.origin}${location.pathname}${location.search}#`;
    }

    const assetType = reminder.isGroup ? 'group' : 'device';
    url += `/${assetType}/${reminder.source.id}`;

    return url;
  }

  private handleReminderUpdate(
    message: Partial<RealtimeMessage<Reminder>>
  ): Reminder | undefined {
    let reminders = cloneDeep(this.reminders);
    let now = moment();

    if (message.realtimeAction === 'DELETE')
      return this.deleteRminderFromList(message, reminders);

    const reminder = this.digestReminders([message.data as Reminder])[0];

    switch (message.realtimeAction) {
      case 'UPDATE':
        reminders = this._reminders.map((r) => {
          if (r.id === reminder.id) r = reminder;
          return r;
        });
        void this.fetchActiveReminderCounter();
        break;
      case 'CREATE':
        reminders = [...reminders, reminder];
        if (
          reminder.status === ReminderStatus.active &&
          moment(reminder.time) <= now
        )
          this.reminderCounter++;
        break;
    }

    // update order & diff
    this.reminders = this.digestReminders(reminders);

    return reminder;
  }

  // all reminders whos `time` is in the past and are still active
  private async fetchActiveReminderCounter(): Promise<number> {
    let counter = 0;

    try {
      const response = await this.eventService.list({
        type: REMINDER_TYPE,
        pageSize: 1,
        fragmentType: 'status',
        fragmentValue: ReminderStatus.active,
        withTotalPages: true,
        dateFrom: '1970-01-01',
        dateTo: moment().toISOString(),
      });

      counter = response?.paging?.totalPages || 0;
    } catch (error) {
      console.error(error); // TODO better error handling
    }

    this.reminderCounter = counter;

    return counter;
  }

  private async fetchReminders(
    pageSize: number,
    currentPage = 1
  ): Promise<Reminder[]> {
    let reminders: Reminder[] = [];

    try {
      const response = await this.eventService.list({
        type: REMINDER_TYPE,
        withTotalPages: currentPage === 1,
        pageSize,
        currentPage,
      });

      reminders = response.data as Reminder[];
    } catch (error) {
      console.error(error); // TODO better error handling
    }

    return this.digestReminders(reminders);
  }

  private filterReminder(
    groups: ReminderGroup[],
    context?: string
  ): ReminderGroup[] {
    // store filter setting to local storage
    const filter = this.buildTypeFilter();
    this.setConfig('filter', filter);

    const config = this.config$.getValue();

    groups = this.applyContextFilter(groups, context);

    // type filter
    if (
      !has(config.filter, 'reminderType') ||
      filter[REMINDER_TYPE_FRAGMENT] === ''
    )
      return groups;

    const keys = Object.keys(filter);
    if (!keys.length) return groups;

    groups.map((group) => {
      group.reminders = group.reminders.filter((reminder) =>
        this.applyReminderFilter(reminder, filter)
      );
      if (!has(group, 'total') || group.total > group.count)
        group.total = group.count;
      group.count = group.reminders.length;
      return group;
    });

    return groups;
  }

  private loadConfig(): void {
    this.config$.next(
      this.localStorageService.getOrDefault<ReminderConfig>(
        REMINDER_LOCAL_STORAGE_CONFIG,
        REMINDER_LOCAL_STORAGE_DEFAULT_CONFIG
      )
    );
  }

  private async requestNotificationPermission(): Promise<boolean> {
    if (!('Notification' in window)) {
      console.log('[R.S:3] This browser does not support notifications.');
      return false;
    }

    const response = await Notification.requestPermission();

    return (this.hasNotificationPermission = response === 'granted');
  }

  private sendNotification(reminder: Reminder): void {
    if (!this.activeTabService.isActive()) return;

    const config = this.config$.getValue();
    if (config.browser) this.sendBrowserNotification(reminder);
    if (config.toast) this.sendToast(reminder);
  }

  private sendBrowserNotification(reminder: Reminder): void {
    if (!this.hasNotificationPermission) {
      console.error(
        '[R.S:2] Could not send browser notification, missing permission.'
      );
      return;
    }

    const notification: Notification = new Notification(
      `${reminder.source.name}`,
      {
        body: `[DUE] ${reminder.text}`,
        data: reminder,
        tag: 'reminder.due',
      }
    );

    notification.addEventListener('click', (event) => {
      const reminder = event.currentTarget['data'] as Reminder;

      window.open(this.getAssetUrlFromReminder(reminder, true), '_blank');
      notification.close();
    });
  }

  private sendToast(reminder: Reminder): void {
    const url = this.getAssetUrlFromReminder(reminder);
    const icon = `<i [c8yIcon]="${
      reminder.isGroup ? 'c8y-group-open' : 'c8y-device'
    }"></i>`;

    this.alertService.add({
      type: 'warning',
      text: `<a href="#${url}" class="full-click">${icon} ${reminder.source.name}</a><br />
        <small>[DUE] ${reminder.text}</small>`,
      allowHtml: true,
    });
  }

  private setUpdateTimer(): void {
    const now = moment();

    clearTimeout(this.updateTimer);

    if (!this.reminders || !this.reminders.length) return;

    const dueReminders = _filter(
      this.reminders,
      (r) => r.status !== ReminderStatus.cleared && moment(r.time) > now
    );
    const closestReminder: Reminder = sortBy(dueReminders, 'time')[0];

    if (!closestReminder) return;

    this.updateTimer = setTimeout(() => {
      this.reminders = this.digestReminders(this.reminders);
      this.sendNotification(closestReminder);
    }, moment(closestReminder.time).diff(now));
  }

  private setupConfigSubscription(): void {
    this.localStorageService.storage$
      .pipe(
        map((config) => {
          if (has(config, REMINDER_LOCAL_STORAGE_CONFIG))
            return JSON.parse(
              config[REMINDER_LOCAL_STORAGE_CONFIG]
            ) as ReminderConfig;
        })
      )
      .subscribe((config) => this.config$.next(config));
  }

  private setupReminderSubscription(): void {
    this.subscriptions.add(
      this.eventRealtimeService
        .onAll$()
        .pipe(
          filter(
            (message) =>
              message.realtimeAction === 'DELETE' ||
              (has(message.data, 'type') &&
                message.data['type'] === REMINDER_TYPE)
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

    this.reminders.forEach((reminder) => {
      dueDate = new Date(reminder.time).getTime();
      if (dueDate <= now && reminder.status === ReminderStatus.active) count++;
    });

    this.reminderCounter = count;
  }
}
