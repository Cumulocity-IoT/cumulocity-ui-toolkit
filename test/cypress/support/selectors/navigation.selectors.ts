/**
 * Selectors for the Cumulocity shell navigation: side-navigator, header bar,
 * user menu, and application tabs.
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Side navigator
// ---------------------------------------------------------------------------
export const NavigatorSelectors = {
  /**
   * Expander arrow on a navigator node.
   * Use `.within(node)` to scope to the correct navigator entry.
   */
  NODE_EXPANDER: '[data-cy="c8y-navigator-node--expander"]',
  /**
   * Returns the selector for a named navigator button (uses `data-cy` = title).
   * Works for both top-level and sub-level nodes.
   */
  node: (title: string) => `c8y-navigator-node button[data-cy="${title}"]`,
  /** Top-level settings node (also has `id="navigator_node_settings"`) */
  settingsNode: (title: string) =>
    `button[data-cy="${title}"][id="navigator_node_settings"]`,
} as const;

// ---------------------------------------------------------------------------
// Header bar
// ---------------------------------------------------------------------------
export const HeaderBarSelectors = {
  /** The user avatar dot / gravatar */
  USER_DOT: '[data-cy="header-bar--user-dot"]',
  /** Main header button (packages source) */
  MAIN_HEADER_BUTTON: '[data-cy="header-bar--main-header-button"]',
  /** Navigator toggle hamburger */
  TOGGLE: '[data-cy="header-bar--toggle"]',
  /** Action-bar "more" button */
  MORE: '[data-cy="action-bar--button-more"]',
} as const;

// ---------------------------------------------------------------------------
// User menu (dropdown from header)
// ---------------------------------------------------------------------------
export const UserMenuSelectors = {
  LOGOUT: '[data-cy="user-menu-logout-button"]',
  SETTINGS: '[data-cy="user-menu-user-settings-button"]',
} as const;

// ---------------------------------------------------------------------------
// Application tabs (c8y-tabs-outlet)
// ---------------------------------------------------------------------------
export const TabMenuSelectors = {
  /** Returns a tab button by its `title` attribute */
  tab: (title: string) => `c8y-tabs-outlet button[title="${title}"]`,
  ADD_DASHBOARD: `c8y-tabs-outlet button[title="Add dashboard"]`,
} as const;

// ---------------------------------------------------------------------------
// Quick-links widget (cockpit welcome / home)
// ---------------------------------------------------------------------------
export const QuickLinksSelectors = {
  GRID: '[data-cy="quick-links-grid"]',
  CONTENT: '[data-cy="quick-links-content"]',
  LINK: '[data-cy="quick-link"]',
  LINK_ICON: '[data-cy="quick-link-icon"]',
  LINK_LABEL: '[data-cy="quick-link-label"]',
} as const;
