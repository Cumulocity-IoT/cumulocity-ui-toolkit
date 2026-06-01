/**
 * Selectors for the Cumulocity dashboard shell, widget management toolbar,
 * widget config drawer and per-widget action menus.
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Dashboard toolbar (top action bar in edit mode)
// ---------------------------------------------------------------------------
export const DashboardSelectors = {
  /** "Edit" pencil button that enters widget-edit mode */
  EDIT_WIDGETS: '[data-cy="c8y-widget-dashboard--edit-widgets"]',
  /** "Add widget" button (visible during edit mode or on empty dashboard) */
  ADD_WIDGET: '[data-cy="widget-dashboard--Add-widget"]',
  /** Legacy title-based fallback used by older shell variants */
  ADD_WIDGET_LEGACY: 'button[title="Add widget"]',
  /** Combined "Add widget" selector for resilient helper flows */
  ADD_WIDGET_ANY: '[data-cy="widget-dashboard--Add-widget"], button[title="Add widget"]',
  /** Dashboard state ready for widget editing (legacy + 1023 variants) */
  WIDGET_EDIT_READY:
    '[data-cy="c8y-widget-dashboard--edit-widgets"], [data-cy="widget-dashboard--Add-widget"], button[title="Add widget"]',
  /** Alternative "Add widget" entry in the action bar dropdown */
  ADD_WIDGET_ACTION: '[data-cy="c8y-widgets-dashboard--add-widget"]',
  /** Saves the current dashboard layout */
  SAVE: '[data-cy="c8y-widgets-dashboard--save"]',
  /** Opens the dashboard edit/settings drawer */
  EDIT_DASHBOARD: '[data-cy="c8y-widgets-dashboard--edit-dashboard"]',
  /** Copies the dashboard */
  COPY_DASHBOARD: '[data-cy="widgets-dashboard--copy-dashboard"]',
  /** Deletes the dashboard */
  DELETE_DASHBOARD: '[data-cy="widgets-dashboard--delete-dashboard"]',
  /** Info banner about copy */
  INFO_COPY: '[data-cy="widgets-dashboard--info-copy-dashboard"]',
  /** Resets the dashboard to its default state */
  RESET: '[data-cy="context-dashboard--button-reset-dashboard"]',
} as const;

// ---------------------------------------------------------------------------
// Dashboard detail form (create / rename dashboard)
// ---------------------------------------------------------------------------
export const DashboardDetailSelectors = {
  SAVE: '[data-cy="dashboard-detail--save-dashboard"]',
  CANCEL: '[data-cy="dashboard-detail--cancel-dashboard"]',
} as const;

// ---------------------------------------------------------------------------
// Version history
// ---------------------------------------------------------------------------
export const DashboardVersionHistorySelectors = {
  TITLE: '[data-cy="c8y-dashboard-version-history--history-title"]',
  ROW: '[data-cy="c8y-dashboard-version-history--history-row"]',
} as const;

// ---------------------------------------------------------------------------
// Per-widget child header (the gear / action area on each widget tile)
// ---------------------------------------------------------------------------
export const WidgetChildSelectors = {
  /** Opens the widget action menu */
  SETTINGS: '[data-cy="c8y-dashboard-child--settings"]',
  /** Settings icon when the dashboard is locked */
  SETTINGS_LOCKED: '[data-cy="c8y-dashboard-child--settings-locked"]',
  /** Opens the widget actions dropdown */
  ACTIONS_DROPDOWN: '[data-cy="c8y-dashboard-child--actions-dropdown"]',
  /** Opens full-screen view (packages source) */
  SETTINGS_FULLSCREEN: '[data-cy="c8y-dashboard-child--settings-fullscreen"]',
} as const;

// ---------------------------------------------------------------------------
// Widget action menu items (appear inside WidgetChildSelectors.ACTIONS_DROPDOWN)
// ---------------------------------------------------------------------------
export const WidgetMenuSelectors = {
  /** Opens the widget configuration drawer */
  EDIT: '[data-cy="widgets-dashboard--Edit-widget"]',
  /** Removes the widget from the dashboard */
  REMOVE: '[data-cy="c8y-widgets-dashboard--remove-widget"]',
} as const;

// ---------------------------------------------------------------------------
// Widget config drawer / "Add widget" modal
// ---------------------------------------------------------------------------
export const WidgetConfigSelectors = {
  /** Search field inside the widget picker */
  SEARCH: '[data-cy="widget-config--Search"]',
  /** Widget list inside the picker */
  WIDGET_LIST: '[data-cy="widget-config--widget-list"]',
  /** Saves widget configuration */
  SAVE: '[data-cy="widget-config--save-widget"]',
  /** Cancels without saving */
  CANCEL: '[data-cy="widget-config--cancel-widget"]',
  /** Refresh button on a widget */
  REFRESH: '[data-cy="widget-controls--refresh-button"]',
} as const;

// ---------------------------------------------------------------------------
// Dashboard list widget
// ---------------------------------------------------------------------------
export const DashboardListSelectors = {
  DEVICE_WIDGET: '[data-cy="c8y-dashboard-list--device-widget"]',
} as const;

// ---------------------------------------------------------------------------
// Home dashboard
// ---------------------------------------------------------------------------
export const HomeDashboardSelectors = {
  CONFIG_DASHBOARD_LIST: '[data-cy="home-dashboard-config--dashboard-list"]',
} as const;
