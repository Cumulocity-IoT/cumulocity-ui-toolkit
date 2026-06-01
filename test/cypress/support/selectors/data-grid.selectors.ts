/**
 * Selectors for the Cumulocity `<c8y-data-grid>` component.
 *
 * Two prefix variants exist in the platform source:
 *   - `c8y-data-grid--*`  (component-scoped, used in tests and templates)
 *   - `data-grid--*`      (legacy / column-header variant)
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Core data-grid elements
// ---------------------------------------------------------------------------
export const DataGridSelectors = {
  /** The `<table>` element */
  TABLE: '[data-cy="c8y-data-grid--table"]',
  /** Scrollable wrapper */
  SCROLL: '[data-cy="c8y-data-grid--table-data-grid-scroll"]',
  /** A row inside the grid body */
  ROW: '[data-cy="c8y-data-grid--row-in-data-grid"]',
  /** Expanded row  */
  EXPANDED_ROW: '[data-cy="c8y-data-grid--expanded-row-in-data-grid"]',
  /** Checkbox on a row */
  CHECKBOX: '[data-cy="c8y-data-grid--checkbox"]',
  /** Radio on a row */
  RADIO: '[data-cy="c8y-data-grid--radio"]',
  /** Edit (pencil) button on a row */
  EDIT_ROW: '[data-cy="c8y-data-grid--edit-button-in-row"]',
  /** Delete button on a row */
  DELETE_ROW: '[data-cy="c8y-data-grid--remove-button-in-row"]',
  /** Row actions dropdown */
  ROW_ACTIONS_DROPDOWN: '[data-cy="c8y-data-grid--row-actions-dropdown"]',
  /** Cell renderer element */
  CELL_RENDERER: '[data-cy="c8y-data-grid--c8y-cell-renderer"]',
  /** Filtering form renderer inside column filter */
  FILTERING_RENDERER: '[data-cy="c8y-data-grid--c8y-filtering-form-renderer"]',
  /** Bulk-actions bar (header row) */
  BULK_ACTIONS: '[data-cy="table-data-grid-header-bulk-actions"]',
} as const;

// ---------------------------------------------------------------------------
// Data-grid filter / column controls
// ---------------------------------------------------------------------------
export const DataGridFilterSelectors = {
  /** Opens the column filter panel */
  FILTERS: '[data-cy="c8y-data-grid--filters"]',
  /** Removes a single filter chip */
  REMOVE_CHIP: '[data-cy="c8y-data-grid--remove-chip"]',
  /** Clears all active filters */
  CLEAR_FILTERS: '[data-cy="c8y-data-grid--clear-filters"]',
  /** Help text for filters */
  HELP_FILTERS: '[data-cy="data-grid--help-filters"]',
  /** Reload / refresh button */
  RELOAD: '[data-cy="data-grid--reload-btn"]',
  /** Record counter badge */
  COUNTER: '[data-cy="data-grid--counter"]',
  /** Page-size options (packages source) */
  PAGESIZE: '[data-cy="data-grid--pagesize-options"]',
} as const;

// ---------------------------------------------------------------------------
// Custom column controls
// ---------------------------------------------------------------------------
export const DataGridCustomColumnSelectors = {
  ADD: '[data-cy="data-grid--add-custom-column"]',
  BUTTON: '[data-cy="data-grid--custom-column-btn"]',
  REMOVE: '[data-cy="data-grid--custom-column-remove-btn"]',
  /** Configure custom column — fragment path input */
  FRAGMENT_PATH: '[data-cy="configure-custom-column--fragmentPath"]',
  /** Configure custom column — header/label input */
  HEADER: '[data-cy="configure-custom-column--header"]',
  /** Custom column header label — parameterised */
  columnHeader: (label: string) => `[data-cy="data-grid--custom-column-header-${label}"]`,
} as const;

// ---------------------------------------------------------------------------
// Column header helpers
// ---------------------------------------------------------------------------
export const DataGridColumnSelectors = {
  /** Returns the sort-order toggle button for a named column */
  sortButton: (header: string) => `[data-cy="change-sort-order"][title*="${header}"]`,
  /** Returns the filter icon button for a named column */
  filterButton: (header: string) =>
    `c8y-data-grid th button[title="${header}"] i[c8yicon="filter"]`,
  /** Header button for a named column (legacy `data-grid--header-btn--*`) */
  headerBtn: (column: string) => `[data-cy="data-grid--header-btn--${column}"]`,
  /** Column cell using the `data-cell-title` pattern (used in WIKA tests) */
  cellByTitle: (title: string) => `[data-cell-title="${title}"]`,
  /** Row action button by its label */
  actionBtn: (label: string) => `[data-cy="c8y-data-grid--button-in-row--${label}"]`,
} as const;

// ---------------------------------------------------------------------------
// Named column selectors (pre-built for common DM column titles)
// ---------------------------------------------------------------------------
export const DataGridColumns = {
  NAME: '[data-cy="data-grid--Name"]',
  STATUS: '[data-cy="data-grid--Status"]',
  MODEL: '[data-cy="data-grid--Model"]',
  SERIAL_NUMBER: '[data-cy="data-grid--Serial number"]',
  GROUP: '[data-cy="data-grid--Group"]',
  TYPE: '[data-cy="data-grid--Type"]',
  TENANT: '[data-cy="data-grid--Tenant"]',
  VERSIONS: '[data-cy="data-grid--Versions"]',
  EXTERNAL_REFERENCE: '[data-cy="data-grid--External reference"]',
  SYSTEM_ID: '[data-cy="data-grid--System ID"]',
} as const;
