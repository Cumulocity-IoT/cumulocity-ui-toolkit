import { IEvent, ITenantOption } from '@c8y/client';

export const REMINDER__ASSET_CONTEXT_ROOTS = ['group', 'device'];
export const REMINDER__TYPE = 'c8y_Reminder';
export const REMINDER__TYPE_FRAGMENT = 'reminderType';
export const REMINDER__INITIAL_QUERY_SIZE = 100;
export const REMINDER__DRAWER_OPEN_CLASS = 'drawerOpen';
export const REMINDER__MAIN_HEADER_CLASS = 'app-main-header';
export const REMINDER__COUNTER_DISPLAY_THRESHOLD = 9;
export const REMINDER__TEXT_LENGTH = 100;
export const REMINDER__HIGHLIGHT_DURATION_SECONDS = 5;
export const REMINDER__TENANT_OPTION__CATEGORY: ITenantOption['category'] = 'c8y.reminder';
export const REMINDER__TENANT_OPTION__TYPE_KEY: ITenantOption['key'] = 'types';
export const REMINDER__TENANT_OPTION__CONFIG_KEY: ITenantOption['key'] = 'config';
export const REMINDER__LOCAL_STORAGE__FILTER = 'c8y_rpFilter';
export const REMINDER__LOCAL_STORAGE__CONFIG = 'c8y_rpConfig';
export const REMINDER__LOCAL_STORAGE__DEFAULT_CONFIG: ReminderConfig = {
  toast: false,
  browser: false,
  filter: { reminderType: '' },
  useContext: false,
};

export interface Reminder extends IEvent {
  type: typeof REMINDER__TYPE;
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

export interface ReminderTenantConfig {
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
} as const;
export type ReminderGroupStatus = (typeof ReminderGroupStatus)[keyof typeof ReminderGroupStatus];

export const ReminderStatus = {
  active: 'ACTIVE',
  acknowledged: 'ACKNOWLEDGED',
  cleared: 'CLEARED',
  unknown: 'UNKNOWN',
} as const;
export type ReminderStatus = (typeof ReminderStatus)[keyof typeof ReminderStatus];

export interface ReminderType {
  id: string;
  name: string;
}
