/**
 * Selectors for Cumulocity generic form components:
 *   - Search input
 *   - Typeahead / dropdown
 *   - Date pickers (bootstrap-date-input)
 *   - List items (c8y-li)
 *   - Split view
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Search input
// ---------------------------------------------------------------------------
export const SearchInputSelectors = {
  /** Opens the asset table */
  ASSET_TABLE_BTN: '[data-cy="search-input--asset-table-btn"]',
  /** Triggers the search */
  SEARCH_BTN: '[data-cy="search-input--search-btn"]',
  /** Search results container */
  RESULTS: '[data-cy="search-input--search-results"]',
  /** Empty state */
  EMPTY_STATE: '[data-cy="search-input--empty-state"]',
  SEARCH_CONTAINS: '[data-cy="search-input--search-contains"]',
  SEARCH_STARTS_WITH: '[data-cy="search-input--search-starts-with"]',
  SEARCH_ENDS_WITH: '[data-cy="search-input--search-ends-with"]',
} as const;

// ---------------------------------------------------------------------------
// Filter input
// ---------------------------------------------------------------------------
export const FilterInputSelectors = {
  INPUT: '[data-cy="filter-input--filter-input"]',
} as const;

// ---------------------------------------------------------------------------
// Typeahead
// ---------------------------------------------------------------------------
export const TypeaheadSelectors = {
  BUTTON: '[data-cy="typeahead-button"]',
  DROPDOWN_MENU: '[data-cy="typeahead--dropdown-menu"]',
} as const;

// ---------------------------------------------------------------------------
// Bootstrap date-input
// ---------------------------------------------------------------------------
export const DateInputSelectors = {
  /** Date input field */
  DATE_INPUT: '[data-cy="bootstrap-date-input"]',
  FROM: '[data-cy="fromDatePicker"]',
  TO: '[data-cy="toDatePicker"]',
} as const;

// ---------------------------------------------------------------------------
// List items (c8y-li)
// ---------------------------------------------------------------------------
export const ListItemSelectors = {
  ACTIONS_BTN: '[data-cy="c8y-li--actions-btn"]',
  COLLAPSE_BTN: '[data-cy="c8y-li--collapse-btn"]',
  /** Action button inside a c8y-li-action */
  ACTION_BTN: '[data-cy="c8y-li-action--btn"]',
  /** Dropdown menu on a list item (packages source) */
  DROPDOWN_MENU: '[data-cy="list-item--dropdown-menu"]',
} as const;

// ---------------------------------------------------------------------------
// Split view
// ---------------------------------------------------------------------------
export const SplitViewSelectors = {
  LEFT_PANE: '[data-cy="left-pane"]',
  RIGHT_PANE: '[data-cy="right-pane"]',
  CONTENT_COLUMN: '[data-cy="content-column"]',
} as const;

// ---------------------------------------------------------------------------
// Select button (generic)
// ---------------------------------------------------------------------------
export const SelectButtonSelectors = {
  SELECT: '[data-cy="select-button"]',
  DESELECT_ALL: '[data-cy="deselect-all-button"]',
} as const;

// ---------------------------------------------------------------------------
// File picker / drop-zone
// ---------------------------------------------------------------------------
export const FilePickerSelectors = {
  FILE_PATH: '[data-cy="file-picker--file-path-input"]',
  FILE_URL: '[data-cy="file-picker--fileUrl"]',
  DROP_ZONE: '[data-cy="c8y-file-placeholder--drop-zone"]',
  DROP_ZONE_HINT: '[data-cy="drop-zone--hint-placeholder"]',
  UPLOAD_PROGRESS: '[data-cy="c8y-file-picker-form-control--upload-progress-bar"]',
} as const;

// ---------------------------------------------------------------------------
// Right-drawer toggle
// ---------------------------------------------------------------------------
export const RightDrawerSelectors = {
  TOGGLE: '[data-cy="right-drawer-toggle-button"]',
} as const;

// ---------------------------------------------------------------------------
// Realtime switch (generic)
// ---------------------------------------------------------------------------
export const RealtimeSwitchSelectors = {
  BUTTON: '[data-cy="realtime-switch--realtime-btn"]',
  CHARTS_ACTIVE: '[data-cy="c8y-charts--realtime-active"]',
  CHARTS_INACTIVE: '[data-cy="c8y-charts--realtime-inactive"]',
} as const;

// ---------------------------------------------------------------------------
// Title outlet
// ---------------------------------------------------------------------------
export const TitleSelectors = {
  TITLE_OUTLET: '[data-cy="c8y-title--title-outlet"]',
} as const;
