import { Component, effect, inject, OnDestroy, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { AlertService, CoreModule, HeaderService } from '@c8y/ngx-components';
import { isEmpty } from 'lodash';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { BsModalService } from 'ngx-bootstrap/modal';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { MomentModule } from 'ngx-moment';
import { Subject, Subscription } from 'rxjs';
import {
  Reminder,
  REMINDER__ASSET_CONTEXT_ROOTS,
  REMINDER__DRAWER_OPEN_CLASS,
  REMINDER__HIGHLIGHT_DURATION_SECONDS,
  REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG,
  REMINDER__MAIN_HEADER_CLASS,
  ReminderConfig,
  ReminderGroup,
  ReminderGroupStatus,
  ReminderStatus,
  ReminderType,
} from '../../models/reminder.model';
import { ReminderService } from '../../services/reminder.service';
import { ReminderModalComponent } from '../reminder-modal/reminder-modal.component';
import { ReminderTypeComponent } from '../reminder-type/reminder-type.component';

@Component({
  selector: 'c8y-reminder-drawer',
  templateUrl: './reminder-drawer.component.html',
  styleUrl: './reminder-drawer.component.less',
  standalone: true,
  imports: [
    CoreModule,
    FormsModule,
    CollapseModule,
    TooltipModule,
    MomentModule,
    ReminderTypeComponent,
    ReminderModalComponent,
  ],
})
export class ReminderDrawerComponent implements OnDestroy {
  private alertService = inject(AlertService);
  private headerService = inject(HeaderService);
  private modalService = inject(BsModalService);
  private router = inject(Router);
  reminderService = inject(ReminderService); // used in template

  /** Current drawer state; the service mirrors it into its own `open` signal. */
  readonly open = signal(false);
  readonly openChange = new Subject<boolean>();
  reminders: Reminder[] = [];
  reminderGroups: ReminderGroup[] = [];
  lastUpdate?: Date;
  types: ReminderType[] = [];

  // for template
  reminderTypeFilter: string = REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG.filter?.reminderType ?? '';

  toastNotificationsEnabled: ReminderConfig['toast'] =
    REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG.toast;

  browserNotificationsEnabled: ReminderConfig['browser'] =
    REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG.browser;

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

  private context?: string;
  private subscriptions = new Subscription();
  private rightDrawerOpen = false;
  private updateTimer?: NodeJS.Timeout;
  private _previousState: Reminder['id'][][] = [];
  private _contextFilterEnabled = REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG.useContext ?? false;

  constructor() {
    this.getReminderTypes();
    this.initSubscriptions();
  }

  ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
    clearTimeout(this.updateTimer);
  }

  /**
   * Creates a new reminder by opening a modal dialog.
   * @returns void
   */
  createReminder(): void {
    this.modalService.show(ReminderModalComponent, {
      class: 'modal-sm',
    });
  }

  /**
   * Sets the filter for reminders based on the provided type.
   * @param type - The ID of the reminder type to filter by.
   * @returns void
   */
  async setFilter(type?: ReminderType['id']): Promise<void> {
    await this.sleep(1000);
    if (type) this.reminderTypeFilter = type;

    this.setConfig('filter');
    this.filterByType();
  }

  /**
   * Filters reminders by their type and updates the reminder groups.
   * @returns void
   */
  filterByType(): void {
    if (!this.types.length) return;

    this.reminderGroups = this.reminderService.groupReminders(
      this.reminders,
      this.contextFilterEnabled ? this.context : undefined
    );
  }

  /**
   * Updates the configuration for reminders based on the provided option.
   * @param configOption - The configuration option to update (e.g., 'filter', 'useContext').
   * @returns void
   */
  setConfig(configOption: keyof ReminderConfig): void {
    // Each branch calls through separately so the key and value types stay paired.
    switch (configOption) {
      case 'filter':
        this.reminderService.setConfig('filter', { reminderType: this.reminderTypeFilter });
        break;
      case 'useContext':
        this.reminderService.setConfig('useContext', this._contextFilterEnabled);
        break;
      case 'toast':
        this.reminderService.setConfig('toast', this.toastNotificationsEnabled);
        break;
      case 'browser':
        this.reminderService.setConfig('browser', this.browserNotificationsEnabled);
        break;
    }
  }

  /** Sets the drawer state and notifies the service. */
  private setOpen(open: boolean): void {
    this.open.set(open);
    this.openChange.next(open);
  }

  /**
   * Toggles the state of the reminder drawer.
   * @param open - Optional boolean to explicitly set the drawer's open state.
   * @returns The updated open state of the drawer.
   */
  toggleDrawer(open?: boolean): boolean {
    open = typeof open === 'boolean' ? open : !this.open();

    this.setOpen(open);
    this.toggleRightDrawer(open);

    return this.open();
  }

  /**
   * Updates the status of a reminder and displays a success or error message.
   * @param reminder - The reminder to update.
   * @param status - The new status to set for the reminder.
   * @returns void
   */
  async updateReminder(reminder: Reminder, status: Reminder['status']): Promise<void> {
    reminder.status = status;

    try {
      await this.reminderService.update(reminder);
      this.alertService.success(`Reminder ${String(status).toLowerCase()}`);
    } catch (error) {
      this.alertService.danger('Failed to update reminder', `${JSON.stringify(error)}`);
    }
  }

  /**
   * Processes and updates the reminders, grouping them and highlighting changes.
   * @param reminders - The list of reminders to process.
   * @returns void
   */
  private digestReminders(reminders: Reminder[]): void {
    this.reminders = reminders;
    this.lastUpdate = new Date();
    this.reminderGroups = this.reminderService.groupReminders(reminders, this.context);

    if (reminders.length) this.highlightChanges();
  }

  /**
   * Retrieves the available reminder types and resets obsolete configurations if necessary.
   * @returns void
   */
  private getReminderTypes(): void {
    this.types = this.reminderService.types;

    // prevent obsolete configs to remain in local storage
    if (!this.types.length) this.reminderService.resetFilterConfig();
  }

  /**
   * Handles changes in the reminder configuration and updates the component state.
   * @param config - The updated reminder configuration.
   * @returns void
   */
  private handleConfigChange(config: ReminderConfig): void {
    if (
      config?.filter &&
      Object.hasOwn(config.filter, 'reminderType') &&
      this.reminderTypeFilter !== config.filter?.reminderType
    ) {
      this.reminderTypeFilter = config.filter.reminderType;
      this.filterByType();
    }

    this._contextFilterEnabled = config.useContext ?? false;
    this.toastNotificationsEnabled = config.toast;
    this.browserNotificationsEnabled = config.browser;
  }

  /**
   * Handles route changes and updates the context for reminders.
   * @param url - The new route URL.
   * @returns void
   */
  private handleRouteChange(url: string): void {
    if (isEmpty(url)) return;

    const pathElements: string[] = url
      .split('/')
      .filter((element) => element && element.length > 0);

    if (!pathElements.length) return;

    const newContext =
      pathElements.length >= 2 && REMINDER__ASSET_CONTEXT_ROOTS.includes(pathElements[0])
        ? pathElements[1]
        : '';

    if (newContext === this.context) return;

    this.context = newContext;
    this.reminderGroups = this.reminderService.groupReminders(this.reminders, this.context);
  }

  /**
   * Highlights changes in reminders by marking new reminders in groups.
   * @returns void
   */
  private highlightChanges(): void {
    if (!this.reminders.length) return;

    // check if a reminder is new in a group
    if (this._previousState.length)
      this.reminderGroups.forEach((group, index) => {
        group.reminders.forEach((reminder) => {
          if (!this._previousState[index]?.includes(reminder.id)) {
            reminder.changed = true;
            setTimeout(() => delete reminder.changed, REMINDER__HIGHLIGHT_DURATION_SECONDS * 1000);
          }
        });
      });

    // store current state for future comparison
    this._previousState = this.reminderGroups.map((group) => {
      return group.reminders.map((reminder) => reminder.id);
    });
  }

  /**
   * Initializes subscriptions for drawer state, reminders, configuration, and route changes.
   * @returns void
   */
  private initSubscriptions(): void {
    // check if the actual drawer was opened
    this.subscriptions.add(
      this.headerService.rightDrawerOpen$.subscribe((open) => {
        this.rightDrawerOpen = open;

        if (open && this.open()) {
          // close the reminders, if the user menu opened
          this.setOpen(false);
        }
      })
    );

    // Live updates on reminders and config come from the service signals.
    effect(() => this.digestReminders(this.reminderService.reminders()));
    effect(() => this.handleConfigChange(this.reminderService.config()));

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

  /**
   * Toggles the right drawer's open state and manages its CSS classes.
   * @param open - Whether to open or close the drawer.
   * @returns void
   */
  private toggleRightDrawer(open: boolean): void {
    // The header belongs to the shell, so it may legitimately be absent.
    const drawer = document.getElementsByClassName(REMINDER__MAIN_HEADER_CLASS)[0];

    if (open) drawer?.classList.add(REMINDER__DRAWER_OPEN_CLASS);
    else drawer?.classList.remove(REMINDER__DRAWER_OPEN_CLASS);

    if (this.rightDrawerOpen) {
      // set user menu drawer status closed, if it is still open
      this.headerService.closeRightDrawer();
      setTimeout(() => {
        // minimal delay needed to override closing animation and keep drawer open
        if (open) drawer?.classList.add(REMINDER__DRAWER_OPEN_CLASS);
      }, 1);
    }
  }

  /**
   * Pauses execution for a specified duration.
   * @param milliseconds - The duration to sleep in milliseconds.
   * @returns A promise that resolves after the specified duration.
   */
  private sleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }
}
