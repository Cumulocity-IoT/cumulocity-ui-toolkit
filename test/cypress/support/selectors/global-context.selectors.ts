/**
 * Selectors for the Cumulocity global time context / date-context controls.
 *
 * These map to the selectors documented and used in
 * cumulocity-ui/cypress/e2e/appEnablementTeam/global-context/globalContextHelpers.ts
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Global context entry-point button (in dashboard action bar)
// ---------------------------------------------------------------------------
export const GlobalContextControlsSelectors = {
  /** Button that opens the global-context dropdown */
  DISPLAY_MODE: '[data-cy="global-time-context-controls--Display-mode"]',
  /** Indicator shown when all widgets are disconnected from global context */
  WIDGETS_DISCONNECTED: '[data-cy="global-time-context-controls--Widgets-disconnected"]',
} as const;

// ---------------------------------------------------------------------------
// Global context dropdown / configuration panel
// ---------------------------------------------------------------------------
export const GlobalDateContextSelectors = {
  /** Aggregation label inside the dropdown */
  AGGREGATION_DISPLAY: '[data-cy="global-date-context--Aggregation-display-value"]',
  /** Apply button in the dropdown */
  APPLY: 'button[data-cy="global-date-context--Apply-button"]',
  /** Selected interval label (e.g. "Last hour") */
  SELECTED_INTERVAL: '[data-cy="global-date-context--Selected-interval"]',
  /** Selected time range text */
  SELECTED_TIME_RANGE: '[data-cy="global-date-context--Selected-time-range"]',
  /** Auto-refresh toggle button */
  AUTO_REFRESH_TOGGLE: '[data-cy="global-date-context--Auto-refresh-toggle"]',
  /** Pause icon that appears when auto-refresh is paused */
  AUTO_REFRESH_PAUSE: '[data-cy="global-date-context--Auto-refresh-toggle-pause"]',
} as const;

// ---------------------------------------------------------------------------
// Inline date-context display (appears in the context-controls bar on dashboard)
// ---------------------------------------------------------------------------
export const GlobalInlineDateContextSelectors = {
  AGGREGATION_DISPLAY: '[data-cy="global-inline-date-context--Aggregation-display"]',
  /** Reload button (packages source) */
  RELOAD: '[data-cy="global-inline-date-context--reload-button"]',
} as const;

// ---------------------------------------------------------------------------
// Date-time context picker toggle (per-widget inline control)
// ---------------------------------------------------------------------------
export const DateTimePickerSelectors = {
  /** The toggle button that opens the date-time picker dropdown */
  TOGGLE: '[data-cy="c8y-date-time-context-picker--picker-toggle"]',
  /** Label text (e.g. "Last hour") */
  LABEL: '[data-cy="c8y-date-time-context-picker--picker-label"]',
  /** Full time-range text */
  TIME_RANGE: '[data-cy="c8y-date-time-context-picker--picker-time-range"]',
} as const;

// ---------------------------------------------------------------------------
// History mode interval selector buttons
// ---------------------------------------------------------------------------
export const IntervalPickerSelectors = {
  MINUTES: '[data-cy="global-context--interval-minutes"]',
  HOURS: '[data-cy="global-context--interval-hours"]',
  DAYS: '[data-cy="global-context--interval-days"]',
  WEEKS: '[data-cy="global-context--interval-weeks"]',
  MONTHS: '[data-cy="global-context--interval-months"]',
  CUSTOM: '[data-cy="global-context--interval-custom"]',
  /** Dynamic interval option by id */
  byId: (id: string) => `[data-cy="interval-picker--${id}"]`,
} as const;

// ---------------------------------------------------------------------------
// Aggregation picker
// ---------------------------------------------------------------------------
export const AggregationPickerSelectors = {
  /** Dropdown toggle for the aggregation picker */
  PICKER: '[data-cy="global-context--aggregation-picker"]',
  /** "No aggregation" option */
  NULL_OPTION: '[data-cy="global-context--aggregation-picker-null"]',
  HOURLY_OPTION: '[data-cy="global-context--aggregation-picker-HOURLY"]',
  DAILY_OPTION: '[data-cy="global-context--aggregation-picker-DAILY"]',
  /** Radio / input for MINUTELY */
  INPUT_MINUTELY: '[data-cy="global-context--aggregation-picker-input-MINUTELY"]',
  /** Radio / input for HOURLY */
  INPUT_HOURLY: '[data-cy="global-context--aggregation-picker-input-HOURLY"]',
  /** Radio / input for DAILY */
  INPUT_DAILY: '[data-cy="global-context--aggregation-picker-input-DAILY"]',
  /** Radio / input for "null" (no aggregation) */
  INPUT_NULL: '[data-cy="global-context--aggregation-picker-input-null"]',
  /** Dynamic aggregation input by level (e.g. 'HOURLY', 'DAILY') */
  inputByLevel: (level: string) =>
    `[data-cy="global-context--aggregation-picker-input-${level}"]`,
} as const;

// ---------------------------------------------------------------------------
// Other global-context controls
// ---------------------------------------------------------------------------
export const GlobalContextExtraSelectors = {
  REALTIME_TOGGLE: '[data-cy="global-context--realtime-toggle"]',
  PULSE_ICON: '[data-cy="global-context--pulse-icon"]',
  REFRESH_INTERVAL: '[data-cy="global-context--refresh-interval-select"]',
  SAVE_TO_DASHBOARD: '[data-cy="global-context--save-to-dashboard-checkbox"]',
} as const;

// ---------------------------------------------------------------------------
// Countdown interval display
// ---------------------------------------------------------------------------
export const CountdownIntervalSelectors = {
  COUNTDOWN: '[data-cy="c8y-countdown-interval--countdown"]',
  SECONDS: '[data-cy="c8y-countdown-interval--seconds"]',
} as const;

// ---------------------------------------------------------------------------
// Context link / unlink controls
// ---------------------------------------------------------------------------
export const ContextLinkSelectors = {
  /** Unified "link all" toggle button */
  ALL: '[data-cy="global-context-link--all"]',
  /** Individual date-time link state indicator */
  DATE_TIME: '[data-cy="global-context-link--dateTimeContext"]',
  /** Individual auto-refresh link state indicator */
  AUTO_REFRESH: '[data-cy="global-context-link--isAutoRefreshEnabled"]',
  /** Individual aggregation link state indicator */
  AGGREGATION: '[data-cy="global-context-link--aggregation"]',
  /** Dynamic link state indicator by state key */
  byStateKey: (key: string) => `[data-cy="global-context-link--${key}"]`,
} as const;

// ---------------------------------------------------------------------------
// Widget config context-mode selector
// ---------------------------------------------------------------------------
export const ContextModeSelectorSelectors = {
  DASHBOARD_MODE: '[data-cy="c8y-config-context-selector--dashboard-mode"]',
  CONFIG_MODE: '[data-cy="c8y-config-context-selector--config-mode"]',
  VIEW_AND_CONFIG_MODE: '[data-cy="c8y-config-context-selector--view-and-config-mode"]',
} as const;

// ---------------------------------------------------------------------------
// Widget time-context inline display (per-widget, disconnected state)
// ---------------------------------------------------------------------------
export const WidgetTimeContextSelectors = {
  DATE_PICKER_BUTTON: '[data-cy="widget-time-context--date-picker-dropdown-button"]',
  SELECTED_INTERVAL: '[data-cy="widget-time-context--selected-interval"]',
  SELECTED_TIME_RANGE: '[data-cy="widget-time-context--selected-time-range"]',
} as const;
