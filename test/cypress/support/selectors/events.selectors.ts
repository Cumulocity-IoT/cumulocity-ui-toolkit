/**
 * Selectors for Cumulocity event-related components:
 *   - Events list widget
 *   - Event details panel
 *   - Events interval-refresh controls
 *   - Events date filter
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Events list widget
// ---------------------------------------------------------------------------
export const EventListSelectors = {
  /** Root element of the events list */
  LIST: '[data-cy="c8y-events-list"]',
  EVENT_TEXT: '[data-cy="c8y-events-list--event-text"]',
  EVENT_DATE: '[data-cy="c8y-events-list--event-date"]',
  EVENT_SOURCE: '[data-cy="c8y-events-list--event-source"]',
  TIMELINE_ITEM: '[data-cy="c8y-events-list--timeline-item"]',
  /** Download attachment button visible on event rows */
  ATTACHMENT_PREVIEW: '[data-cy="c8y-events-list--image-preview"]',
  /** Image preview (packages source) */
  PREVIEW_BTN: '[data-cy="c8y-events-list--preview-btn"]',
  /** Events-timeline body template slot */
  TIMELINE_BODY: '[data-cy="c8y-events-timeline--body-template"]',
  /** Interval toggle on the events widget */
  INTERVAL_TOGGLE: '[data-cy="c8y-events-interval-toggle"]',
} as const;

// ---------------------------------------------------------------------------
// Event details panel
// ---------------------------------------------------------------------------
export const EventDetailsSelectors = {
  TITLE: '[data-cy="c8y-event-details-title"]',
  TYPE: '[data-cy="c8y-event-details--type-wrapper"]',
  TIME: '[data-cy="c8y-event-details--time-wrapper"]',
  CREATION_TIME: '[data-cy="c8y-event-details--creation-time-wrapper"]',
  LAST_UPDATED: '[data-cy="c8y-event-details--last-updated-wrapper"]',
  SOURCE: '[data-cy="c8y-event-details--source-wrapper"]',
  CUSTOM_FRAGMENTS: '[data-cy="c8y-event-details--custom-fragments-wrapper"]',
  ATTACHMENT: '[data-cy="c8y-event-details--attachment-wrapper"]',
  ATTACHMENT_PREVIEW: '[data-cy="c8y-event-details--attachment-preview"]',
  DOWNLOAD: '[data-cy="c8y-event-details--download-btn"]',
  /** Calendar icon next to timestamp (packages source) */
  CALENDAR_ICON: '[data-cy="c8y-event-details--calendar-icon"]',
  /** Custom data key/value pairs section */
  CUSTOM_DATA: '[data-cy="event-details-custom-data"]',
  CUSTOM_DATA_ITEM: '[data-cy="event-details-custom-data-item"]',
} as const;

// ---------------------------------------------------------------------------
// Events interval-refresh controls
// ---------------------------------------------------------------------------
export const EventIntervalRefreshSelectors = {
  BUTTON: '[data-cy="c8y-events-interval-refresh--btn"]',
  PAUSE: '[data-cy="c8y-events-interval-refresh--pause"]',
  SELECTOR: '[data-cy="c8y-events-interval-refresh--selector"]',
  TOGGLE_COUNTDOWN: '[data-cy="c8y-events-interval-refresh--toggle-countdown"]',
} as const;

// ---------------------------------------------------------------------------
// Events date filter
// ---------------------------------------------------------------------------
export const EventDateFilterSelectors = {
  /** Opens/toggles the date filter dropdown */
  DROPDOWN_BUTTON: '[data-cy="events-date-filter--date-picker-dropdown-button"]',
  APPLY: '[data-cy="events-date-filter--apply-button"]',
} as const;

// ---------------------------------------------------------------------------
// Event type filter
// ---------------------------------------------------------------------------
export const EventTypeFilterSelectors = {
  ROOT: '[data-cy="c8y-event-type-filter"]',
} as const;

// ---------------------------------------------------------------------------
// Event list widget config panel
// ---------------------------------------------------------------------------
export const EventListWidgetConfigSelectors = {
  CHILD_DEVICES_LABEL: '[data-cy="c8y-event-list-widget-config--child-devices-label"]',
  CHILD_DEVICES_SECTION: '[data-cy="c8y-event-list-widget-config--child-devices-section"]',
  SHOW_FOR_CHILDREN: '[data-cy="c8y-event-list-widget-config--showEventsForChildren-checkbox"]',
} as const;

// ---------------------------------------------------------------------------
// Send/Create event widget
// ---------------------------------------------------------------------------
export const SendEventWidgetSelectors = {
  /** Description textarea for creating an event */
  DESCRIPTION: '[data-cy="create-event-description"]',
  /** Create/submit button for sending the event */
  CREATE_BUTTON: 'button[aria-label="Create event"]',
  /** Event type select dropdown */
  EVENT_TYPE_SELECT: 'select[formcontrolname="eventType"]',
} as const;
