/**
 * Selectors for Cumulocity alarm-related components:
 *   - Alarm list widget
 *   - Alarm details panel
 *   - Alarm filter toolbar
 *   - Alarm interval-refresh controls
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Alarm list widget
// ---------------------------------------------------------------------------
export const AlarmListSelectors = {
  /** Root element of the alarm list */
  LIST: '[data-cy="c8y-alarms-list"]',
  ALARM_TEXT: '[data-cy="c8y-alarms-list--alarm-text"]',
  ALARM_SOURCE_NAME: '[data-cy="c8y-alarms-list--alarm-source-name"]',
  BADGE: '[data-cy="c8y-alarms-list--badge"]',
  LAST_OCCURRENCE: '[data-cy="c8y-alarms-list--last-occurrence-date"]',
  TIMELINE_REPEAT: '[data-cy="c8y-alarms-list--timeline-repeat"]',
  /** "Clear all" button in the alarm view */
  CLEAR_ALL: '[data-cy="c8y-alarms-view--clear-all-button"]',
  /** Realtime toggle button on the alarms toolbar */
  REALTIME: '[data-cy="c8y-alarms--realtime-button"]',
  /** Interval toggle on the alarms widget */
  INTERVAL_TOGGLE: '[data-cy="c8y-alarms-widget--interval-toggle-button"]',
  /** Empty-state info panel */
  EMPTY_STATE: '[data-cy="c8y-alarms-info--empty-state"]',
} as const;

// ---------------------------------------------------------------------------
// Alarm details panel
// ---------------------------------------------------------------------------
export const AlarmDetailsSelectors = {
  TITLE: '[data-cy="c8y-alarm-details-title"]',
  BADGE: '[data-cy="c8y-alarm-details--badge"]',
  /** "Clear alarm" action button */
  CLEAR: '[data-cy="c8y-alarm-details--clear-alarm"]',
  SEVERITY_TYPE: '[data-cy="c8y-alarm-details--severity-type-wrapper"]',
  SEVERITY_SECTION: '[data-cy="c8y-alarm-details--severity-section-wrapper"]',
  STATUS_SECTION: '[data-cy="c8y-alarm-details--status-section-wrapper"]',
  SOURCE: '[data-cy="c8y-alarm-details--source-wrapper"]',
  FIRST_OCCURRENCE: '[data-cy="c8y-alarm-details--first-occurrence-wrapper"]',
  LAST_UPDATED: '[data-cy="c8y-alarm-details--last-updated-wrapper"]',
  LAST_UPDATED_ICON: '[data-cy="c8y-alarm-details--last-updated-icon"]',
  OCCURRENCES: '[data-cy="c8y-alarm-details--number-of-occurrences-wrapper"]',
  CUSTOM_FRAGMENTS: '[data-cy="c8y-alarm-details--custom-fragments-wrapper"]',
  /** Link back to device management from alarm details */
  DM_LINK: '[data-cy="alarm-details-device-management-link"]',
  /** Open audit logs */
  AUDIT_LOGS: '[data-cy="c8y-alarms-details--audit-logs"]',
  RELOAD_AUDIT: '[data-cy="c8y-alarms-details--reload-audit-logs"]',
  CREATE_SMART_RULE: '[data-cy="c8y-alarms-details--create-smart-rule"]',
} as const;

// ---------------------------------------------------------------------------
// Alarm severity filter toolbar
// ---------------------------------------------------------------------------
export const AlarmFilterSelectors = {
  /** Root filter bar */
  ROOT: '[data-cy="c8y-alarms-filter"]',
  /** Shows all severities */
  ALL: '[data-cy="c8y-alarms-filter--all"]',
  CRITICAL: '[data-cy="c8y-alarms-filter--CRITICAL"]',
  MAJOR: '[data-cy="c8y-alarms-filter--MAJOR"]',
  MINOR: '[data-cy="c8y-alarms-filter--MINOR"]',
  WARNING: '[data-cy="c8y-alarms-filter--WARNING"]',
  /** Badge on the MAJOR filter chip */
  MAJOR_BADGE: '[data-cy="c8y-alarms-filter--MAJOR-badge"]',
  /** "Cleared" filter chip */
  CLEARED: '[data-cy="c8y-alarms-filter--cleared"]',
  /** Apply the active filter selection */
  APPLY: '[data-cy="c8y-alarms-filter--apply"]',
  /** Removes the active filter chip */
  REMOVE_CHIP: '[data-cy="c8y-alarms-filter--remove-chip"]',
  STATUS_ICON: '[data-cy="c8y-alarms-icon--status-icon"]',

  // Dynamic helpers
  /** Returns the filter selector for a given severity string (e.g. 'CRITICAL') */
  bySeverity: (severity: string) => `[data-cy="c8y-alarms-filter--${severity.toUpperCase()}"]`,
  /** Returns the badge selector for a given severity */
  badgeBySeverity: (severity: string) =>
    `[data-cy="c8y-alarms-filter--${severity.toUpperCase()}-badge"]`,
  /** Returns the icon selector for a given severity */
  iconBySeverity: (severity: string) =>
    `[data-cy="c8y-alarms-filter--icon-${severity.toUpperCase()}"]`,
  /** Returns the chip selector for a given severity */
  chipBySeverity: (severity: string) =>
    `[data-cy="c8y-alarms-filter--chip-${severity.toUpperCase()}"]`,
} as const;

// ---------------------------------------------------------------------------
// Alarm interval-refresh controls
// ---------------------------------------------------------------------------
export const AlarmIntervalRefreshSelectors = {
  BUTTON: '[data-cy="c8y-alarms-interval-refresh--btn"]',
  PAUSE: '[data-cy="c8y-alarms-interval-refresh--pause"]',
  SELECTOR: '[data-cy="c8y-alarms-interval-refresh--selector"]',
  TOGGLE_COUNTDOWN: '[data-cy="c8y-alarms-interval-refresh--toggle-countdown"]',
  INTERVAL_TOGGLE: '[data-cy="c8y-alarms-interval-toggle"]',
} as const;

// ---------------------------------------------------------------------------
// Alarm list widget config panel
// ---------------------------------------------------------------------------
export const AlarmListWidgetConfigSelectors = {
  CHILD_DEVICES_LABEL: '[data-cy="c8y-alarm-list-widget-config--child-devices-label"]',
  CHILD_DEVICES_SECTION: '[data-cy="c8y-alarm-list-widget-config--child-devices-section"]',
  SHOW_FOR_CHILDREN: '[data-cy="c8y-alarm-list-widget-config--showAlarmsForChildren-checkbox"]',
  ORDER_ELEMENTS: '[data-cy="c8y-alarm-list-widget-config--order-elements"]',
  PREVIEW_LIST: '[data-cy="c8y-alarm-list-widget-config--preview-alarm-list"]',
  SEVERITIES: '[data-cy="c8y-alarm-list-widget-config--severities-elements"]',
  STATUS_ELEMENTS: '[data-cy="c8y-alarm-list-widget-config--status-elements"]',
  STATUS_LABEL: '[data-cy="c8y-alarm-list-widget-config-status-label"]',
  TYPES_ELEMENTS: '[data-cy="c8y-alarm-list-widget-config--types-elements"]',
  TYPES_ADD: '[data-cy="c8y-alarm-list-widget-config--types-add-type"]',
  TYPES_REMOVE: '[data-cy="c8y-alarm-list-widget-config--types-remove-type"]',
} as const;

// ---------------------------------------------------------------------------
// Alarm/event selector modal
// ---------------------------------------------------------------------------
export const AlarmEventSelectorSelectors = {
  INNER_COLUMN: '[data-cy="c8y-alarm-event-selector--inner-column"]',
} as const;
