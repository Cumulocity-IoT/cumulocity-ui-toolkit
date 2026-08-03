/**
 * Selectors for Cumulocity data-point and data-points-list components.
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Data-point selection / picker
// ---------------------------------------------------------------------------
export const DatapointSelectorSelectors = {
  /** "Add data point" button in the selection list */
  ADD_BUTTON: '[data-cy="c8y-datapoint-selection-list--add-datapoint-button"]',
  /** Add button in the selector list item (packages source) */
  LIST_ITEM_ADD: '[data-cy="datapoint-selector-list-item--add-datapoint-button"]',
  /** Toggle visibility of a data point */
  TOGGLE_VISIBILITY: '[data-cy="datapoint-toggle-visibility-btn"]',
  /** Warning icon on a data point */
  WARNING_ICON: '[data-cy="datapoint-warning-icon"]',
} as const;

// ---------------------------------------------------------------------------
// Data-point library
// ---------------------------------------------------------------------------
export const DatapointLibrarySelectors = {
  ADD_DATA_POINT: '[data-cy="c8y-datapoint-library-list--add-data-point"]',
} as const;

// ---------------------------------------------------------------------------
// Data-points list widget (table view)
// ---------------------------------------------------------------------------
export const DatapointsListSelectors = {
  EMPTY_STATE: '[data-cy="datapoints-list--empty-state"]',
  /** Column: asset value */
  ASSET: '[data-cy="datapointlist-asset"]',
  /** Column: current value */
  CURRENT: '[data-cy="datapointlist-current"]',
  /** Column: diff */
  DIFF: '[data-cy="datapointlist-diff"]',
  /** Column: diff percentage */
  DIFF_PERCENT: '[data-cy="datapointlist-diffPercentage"]',
  /** Column: KPI value */
  KPI: '[data-cy="datapointlist-kpi"]',
  /** Column: target value */
  TARGET: '[data-cy="datapointlist-target"]',
} as const;

// ---------------------------------------------------------------------------
// Data-points table widget
// ---------------------------------------------------------------------------
export const DatapointsTableSelectors = {
  EMPTY_STATE: '[data-cy="datapoints-table-list--empty-state"]',
  /** Interval toggle button */
  INTERVAL_TOGGLE: '[data-cy="c8y-data-points-table-widget--interval-toggle-button"]',
  /** Reload / refresh button */
  RELOAD: '[data-cy="c8y-data-points-table-widget--reload-button"]',
  VALUE_MIN: '[data-cy="c8y-datapoints-table--value-min"]',
  VALUE_MAX: '[data-cy="c8y-datapoints-table--value-max"]',
  VALUE_MINMAX: '[data-cy="c8y-datapoints-table--value-minmax"]',
  VALUE_MINMAX_MIN: '[data-cy="c8y-datapoints-table--value-minmax-min"]',
  VALUE_MINMAX_MAX: '[data-cy="c8y-datapoints-table--value-minmax-max"]',
} as const;

// ---------------------------------------------------------------------------
// Data-points export selector
// ---------------------------------------------------------------------------
export const DatapointsExportSelectors = {
  OPEN_EXPORT: '[data-cy="datapoints-export-selector--open-export-button"]',
  /** Export selector root */
  EXPORT_SELECTOR: '[data-cy="data-scope--export-selector"]',
  AGGREGATION_SELECTOR: '[data-cy="data-scope--aggregation-selector"]',
  HELP: '[data-cy="data-scope--help"]',
} as const;

// ---------------------------------------------------------------------------
// KPI widget
// ---------------------------------------------------------------------------
export const KpiWidgetSelectors = {
  EMPTY_STATE: '[data-cy="kpi-widget--empty-state-no-data-point-selected"]',
} as const;

// ---------------------------------------------------------------------------
// Data-point alarm/event list (widget)
// ---------------------------------------------------------------------------
export const DataPointAlarmEventListSelectors = {
  ROOT: '[data-cy="c8y-data-point-alarm-event-list"]',
} as const;
