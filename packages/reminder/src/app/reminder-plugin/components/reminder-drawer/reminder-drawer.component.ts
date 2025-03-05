import { Component, OnDestroy } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { AlertService, HeaderService } from '@c8y/ngx-components';
import { has, isEmpty } from 'lodash';
import { BsModalService } from 'ngx-bootstrap/modal';
import { BehaviorSubject, Subscription } from 'rxjs';
import {
  Reminder,
  ReminderConfig,
  ReminderGroup,
  ReminderGroupStatus,
  ReminderStatus,
  ReminderType,
  REMINDER_ASSET_CONTEXT_ROOTS,
  REMINDER_DRAWER_OPEN_CLASS,
  REMINDER_HIGHLIGHT_DURATION_SECONDS,
  REMINDER_LOCAL_STORAGE_DEFAULT_CONFIG,
  REMINDER_MAIN_HEADER_CLASS,
} from '../../reminder.model';
import { ReminderService } from '../../services/reminder.service';
import { ReminderModalComponent } from '../reminder-modal/reminder-modal.component';

@Component({
  selector: 'c8y-reminder-drawer',
  templateUrl: './reminder-drawer.component.html',
  styleUrl: './reminder-drawer.component.less',
})
export class ReminderDrawerComponent implements OnDestroy {
  open$ = new BehaviorSubject<boolean>(this.open);
  reminders: Reminder[] = [];
  reminderGroups: ReminderGroup[] = [];
  lastUpdate?: Date;
  types: ReminderType[] = [];

  // for template
  reminderTypeFilter: string =
    REMINDER_LOCAL_STORAGE_DEFAULT_CONFIG.filter.reminderType;
  toastNotificationsEnabled: ReminderConfig['toast'] =
    REMINDER_LOCAL_STORAGE_DEFAULT_CONFIG.toast;
  browserNotificationsEnabled: ReminderConfig['browser'] =
    REMINDER_LOCAL_STORAGE_DEFAULT_CONFIG.browser;
  reminderStatus = ReminderStatus;
  reminderGroupStatus = ReminderGroupStatus;
  groupIsExpanded: boolean[] = [true, true, false];

  get contextFilterEnabled(): boolean {
    return this._contextFilterEnabled;
  }
  set contextFilterEnabled(enabled: boolean) {
    this._contextFilterEnabled = enabled;
    this.setConfig('useContext');
    this.filterByType();
  }

  get open(): boolean {
    return this._open;
  }

  set open(openStatus: boolean) {
    this._open = openStatus;
    this.open$.next(openStatus);
  }

  private context?: string;
  private subscriptions = new Subscription();
  private rightDrawerOpen = false;
  private updateTimer?: NodeJS.Timeout;
  private _open = false;
  private _previousState: Reminder['id'][][] = [];
  private _contextFilterEnabled =
    REMINDER_LOCAL_STORAGE_DEFAULT_CONFIG.useContext;

  constructor(
    private alertService: AlertService,
    private headerService: HeaderService,
    private modalService: BsModalService,
    private reminderService: ReminderService,
    private router: Router
  ) {
    this.getReminderTypes();
    this.initSubscriptions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.updateTimer);
  }

  createReminder(): void {
    this.modalService.show(ReminderModalComponent, {
      class: 'modal-sm',
    });
  }

  async setFilter(type?: ReminderType['id']): Promise<void> {
    await this.sleep(1000);
    if (type) this.reminderTypeFilter = type;

    this.setConfig('filter');
    this.filterByType();
  }

  filterByType(): void {
    if (!this.types.length) return;

    this.reminderGroups = this.reminderService.groupReminders(
      this.reminders,
      this.contextFilterEnabled ? this.context : null
    );
  }

  setConfig(configOption: string) {
    let value;

    switch (configOption) {
      case 'filter':
        value = {
          reminderType: this.reminderTypeFilter,
        };
        break;
      case 'useContext':
        value = this._contextFilterEnabled;
        break;
      case 'toast':
         value = this.toastNotificationsEnabled;
        break;
      case 'browser':
         value = this.browserNotificationsEnabled;
        break;
    }
    this.reminderService.setConfig(configOption, value);
  }

  toggleDrawer(open?: boolean): boolean {
    open = typeof open === 'boolean' ? open : !this.open;

    this.open = open;
    this.toggleRightDrawer(open);

    return this.open;
  }

  private digestReminders(reminders: Reminder[]): void {
    this.reminders = reminders;
    this.lastUpdate = new Date();
    this.reminderGroups = this.reminderService.groupReminders(reminders);

    if (reminders.length) this.highlightChanges();
  }

  private getReminderTypes(): void {
    this.types = this.reminderService.types;

    // prevent obsolte configs to remain in local storage
    if (!this.types.length) this.reminderService.resetFilterConfig();
  }

  private handleConfigChange(config: ReminderConfig): void {
    if (
      has(config.filter, 'reminderType') &&
      this.reminderTypeFilter !== config.filter?.reminderType
    ) {
      this.reminderTypeFilter = config.filter.reminderType;
      this.filterByType();
    }

    this._contextFilterEnabled = config.useContext;
    this.toastNotificationsEnabled = config.toast;
    this.browserNotificationsEnabled = config.browser;
  }

  private handleRouteChange(url): void {
    if (isEmpty(url)) {
      return undefined;
    }

    const pathElements = url.split('/').filter((element) => !isEmpty(element));

    if (pathElements === null || pathElements.length === 0) {
      return undefined;
    }

    this.context =
      pathElements.length >= 2 &&
      REMINDER_ASSET_CONTEXT_ROOTS.includes(pathElements[0])
        ? pathElements[1]
        : '';
    this.reminderGroups = this.reminderService.groupReminders(
      this.reminders,
      this.context
    );
  }

  private highlightChanges(): void {
    if (!this.reminders.length) return;

    // check if a reminder is new in a group
    if (this._previousState.length)
      this.reminderGroups.forEach((group, index) => {
        group.reminders.forEach((reminder) => {
          if (!this._previousState[index]?.includes(reminder.id)) {
            reminder.changed = true;
            setTimeout(
              () => delete reminder.changed,
              REMINDER_HIGHLIGHT_DURATION_SECONDS * 1000
            );
          }
        });
      });

    // store current state for future comparison
    this._previousState = this.reminderGroups.map((group) => {
      return group.reminders.map((reminder) => reminder.id);
    });
  }

  private initSubscriptions(): void {
    // check if the actual drawer was opened
    this.subscriptions.add(
      this.headerService.rightDrawerOpen$.subscribe((open) => {
        this.rightDrawerOpen = open;

        if (open && this.open) {
          // close the reminders, if the user menu opened
          this.open = false;
        }
      })
    );

    // get live updates on reminders from service
    this.subscriptions.add(
      this.reminderService.reminders$.subscribe((reminders) =>
        this.digestReminders(reminders)
      )
    );

    // get config updates
    this.subscriptions.add(
      this.reminderService.config$.subscribe((config) =>
        this.handleConfigChange(config)
      )
    );

    // route change for context
    this.subscriptions.add(
      this.router.events.subscribe({
        next: (event) => {
          // TODO debounce
          if (event instanceof NavigationEnd) this.handleRouteChange(event.url);
        },
      })
    );
  }

  private toggleRightDrawer(open: boolean): void {
    const drawer = document.getElementsByClassName(
      REMINDER_MAIN_HEADER_CLASS
    )[0];

    if (open) drawer.classList.add(REMINDER_DRAWER_OPEN_CLASS);
    else drawer.classList.remove(REMINDER_DRAWER_OPEN_CLASS);

    if (this.rightDrawerOpen) {
      // set user menu drawer status closed, if it is still open
      this.headerService.closeRightDrawer();
      setTimeout(() => {
        // minimal delay needed to override closing animation and keep drawer open
        if (open) drawer.classList.add(REMINDER_DRAWER_OPEN_CLASS);
      }, 1);
    }
  }

  async updateReminder(
    reminder: Reminder,
    status: Reminder['status']
  ): Promise<void> {
    reminder.status = status;

    const { res } = await this.reminderService.update(reminder);

    if (res.status === 200) {
      this.alertService.success(`Reminder ${String(status).toLowerCase()}`);
    } else {
      this.alertService.danger('Could not update reminder', res.statusText);
    }
  }

  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
