import { IEvent, ITenantOption } from '@c8y/client';
import { AssetFilterConfig } from '~models/asset-access.model';

export const REMINDER__ASSET_CONTEXT_ROOTS = ['group', 'device'];
export const REMINDER__TYPE = 'c8y_Reminder';
export const REMINDER__TYPE_FRAGMENT = 'reminderType';
export const REMINDER__INITIAL_QUERY_SIZE = 100;
export const REMINDER__DRAWER_OPEN_CLASS = 'drawerOpen';
export const REMINDER__MAIN_HEADER_CLASS = 'app-main-header';
export const REMINDER__COUNTER_DISPLAY_THRESHOLD = 9;
export const REMINDER__TEXT_LENGTH = 100;
export const REMINDER__HIGHLIGHT_DURATION_SECONDS = 5;
/**
 * Reminders are polled instead of received via realtime: the event realtime
 * channel is tenant-wide (`/events/*`), and on busy tenants every message on it
 * triggers a full change detection cycle, regardless of whether it is a reminder.
 */
export const REMINDER__POLL_INTERVAL_MS = 30 * 1000;
/**
 * How far back a due reminder is still announced. Covers a reminder created
 * elsewhere for "now" (the modal rounds down to the minute, up to 59 s) plus one
 * poll interval, while a tab resuming from sleep does not replay older ones.
 */
export const REMINDER__ANNOUNCE_WINDOW_MS = 2 * 60 * 1000;
/**
 * Maximum age of the due counter from the API when nothing in the first page changed.
 * The count query scans all reminder events of the tenant, so it is not sent on every poll.
 */
export const REMINDER__COUNTER_MAX_AGE_MS = 5 * 60 * 1000;
/** Minimum gap between loads triggered by switching back to the tab. */
export const REMINDER__REFRESH_MIN_INTERVAL_MS = 5 * 1000;
export const REMINDER__TENANT_OPTION__CATEGORY: ITenantOption['category'] = 'c8y.reminder';
export const REMINDER__LOCAL_STORAGE__FILTER = 'c8y_rpFilter';
export const REMINDER__LOCAL_STORAGE__CONFIG = 'c8y_rpConfig';
/** Reminders announced recently (`id@time` → due time), shared by all tabs. */
export const REMINDER__LOCAL_STORAGE__ANNOUNCED = 'c8y_rpAnnounced';
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
  /** ms since `time`; positive once the reminder is due. Set locally, not stored. */
  diff?: number;
  /** Highlight flag set by the drawer for a few seconds. Set locally, not stored. */
  changed?: boolean;
  isCleared?: object;
  reminderType?: ReminderType['id'];
}

export interface ReminderTenantOptions {
  types?: ReminderType[];
  config?: ReminderTenantConfig;
  assetFilter?: AssetFilterConfig;
  defaults?: ReminderConfig;
}

export interface ReminderConfig {
  browser?: boolean;
  filter?: ReminderGroupFilter;
  toast?: boolean;
  useContext?: boolean;
}

export interface ResponsibilityFilter extends Partial<AssetFilterConfig> {
  enabled: boolean;
}

export interface ReminderTenantConfig {
  useContext?: boolean;
  responsibilityFilter?: ResponsibilityFilter;
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
