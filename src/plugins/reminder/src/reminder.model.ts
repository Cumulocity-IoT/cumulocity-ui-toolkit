import { IEvent, ITenantOption } from '@c8y/client';

export const REMINDER_ASSET_CONTEXT_ROOTS = ['group', 'device'];
export const REMINDER_TYPE = 'c8y_Reminder';
export const REMINDER_TYPE_FRAGMENT = 'reminderType';
export const REMINDER_INITIAL_QUERY_SIZE = 100;
export const REMINDER_DRAWER_OPEN_CLASS = 'drawerOpen';
export const REMINDER_MAIN_HEADER_CLASS = 'app-main-header';
export const REMINDER_MAX_COUNTER = 10;
export const REMINDER_TEXT_LENGTH = 100;
export const REMINDER_HIGHLIGHT_DURATION_SECONDS = 5;
export const REMINDER_TENENAT_OPTION_CATEGORY: ITenantOption['category'] = 'c8y.reminder';
export const REMINDER_TENENAT_OPTION_TYPE_KEY: ITenantOption['key'] = 'types';
export const REMINDER_LOCAL_STORAGE_FILTER = 'c8y_rpFilter';
export const REMINDER_LOCAL_STORAGE_CONFIG = 'c8y_rpConfig';
export const REMINDER_LOCAL_STORAGE_DEFAULT_CONFIG: ReminderConfig = {
  toast: false,
  browser: false,
  filter: { reminderType: '' },
  useContext: false,
};

export interface Reminder extends IEvent {
  status: ReminderStatus;
  isGroup?: object;
  diff?: number;
  isCleared?: object;
  reminderType?: ReminderType['id'];
}

export interface ReminderConfig {
  browser?: boolean;
  filter?: ReminderGroupFilter;
  toast?: boolean;
  useContext?: boolean;
}

export interface ReminderGroup {
  status: ReminderGroupStatus;
  reminders: Reminder[];
  count: number;
  total?: number;
}

export interface ReminderGroupFilter {
  [key: string]: string;
}

export const ReminderGroupStatus = {
  due: 'DUE',
  upcoming: 'UPCOMING',
  cleared: 'CLEARED',
};
export type ReminderGroupStatus =
  (typeof ReminderGroupStatus)[keyof typeof ReminderGroupStatus];

export const ReminderStatus = {
  active: 'ACTIVE',
  acknowledged: 'ACKNOWLEDGED',
  cleared: 'CLEARED',
};
export type ReminderStatus =
  (typeof ReminderStatus)[keyof typeof ReminderStatus];

export interface ReminderType {
  id: string;
  name: string;
}
