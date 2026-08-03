/**
 * Selectors for Cumulocity cockpit/shell setup, branding, and application
 * management screens.
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Cockpit setup wizard
// ---------------------------------------------------------------------------
export const CockpitSetupSelectors = {
  SETUP_TITLE: '[data-cy="c8y-setup--setup-header-title"]',
  COMPLETED_TITLE: '[data-cy="c8y-setup--completed-header-title"]',
  START_SETUP: '[data-cy="c8y-setup--start-setup-button"]',
  DONE: '[data-cy="c8y-setup-completed--done-button"]',
  STEP1_TITLE: '[data-cy="c8y-cockpit-setup-step1--step1-header-title"]',
  STEP2_TITLE: '[data-cy="c8y-cockpit-setup-step2--step2-header-title"]',
  STEP3_TITLE: '[data-cy="c8y-cockpit-setup-step3--step3-header-title"]',
  STEP4_TITLE: '[data-cy="c8y-cockpit-setup-step4--step4-header-title"]',
  SAVE_CONTINUE: '[data-cy="c8y-cockpit-setup-stepper-buttons--save-continue-button"]',
} as const;

// ---------------------------------------------------------------------------
// Application / extension management
// ---------------------------------------------------------------------------
export const ApplicationCardSelectors = {
  PACKAGE_NAME: '[data-cy="application-card--package-name"]',
  EDIT: '[data-cy="application-card--edit-button"]',
  DELETE: '[data-cy="application-card--delete-button"]',
  SETTINGS: '[data-cy="application-card--settings-button"]',
  EXTENSIONS_LIST: '[data-cy="application-card--extensions-list"]',
} as const;

export const ApplicationDetailSelectors = {
  TYPE: '[data-cy="application-detail--type"]',
  VERSION: '[data-cy="application-detail--version"]',
  BILLING_MODE: '[data-cy="application-detail--billing-mode"]',
  ISOLATION: '[data-cy="application-detail--isolation"]',
  PROVIDER: '[data-cy="application-detail--provider"]',
} as const;

export const PackagesSelectors = {
  ADD_EXTENSION: '[data-cy="packages-list--add-extension-package"]',
  DEPLOY_APPLICATION: '[data-cy="c8y-deploy-application--deploy-blueprint-button"]',
  CANCEL_DEPLOY: '[data-cy="c8y-deploy-application--cancel-blueprint-button"]',
  PACKAGE_DETAILS_DEPLOY: '[data-cy="c8y-package-details--deploy-application-button"]',
} as const;

export const PluginSelectors = {
  INSTALL: '[data-cy="plugin-list--install-plugin-button"]',
  UNINSTALL: '[data-cy="plugin-list--uninstall-plugin-button"]',
  SETUP_CONTINUE: '[data-cy="c8y-plugin-setup-stepper--continue-button"]',
} as const;

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------
export const BrandingSelectors = {
  SAVE: '[data-cy="branding-save"]',
  GET_STARTED: '[data-cy="branding-get-started-using-branding"]',
  ADD_VARIANT: '[data-cy="branding-add-branding-variant"]',
  RESET_SHADES: '[data-cy="branding-reset-shades-button"]',
  COLOR_BRAND_PRIMARY: '[data-cy="branding-theme-form-color-input-brand-primary"]',
  COLOR_BRAND_30: '[data-cy="branding-theme-form-color-input-c8y-brand-30"]',
  /** Dynamic: tag chip for a given variant name */
  tagCell: (variantName: string) =>
    `[data-cy="branding-tags-cell-renderer--tag-${variantName}"]`,
  /** Dynamic: apply-to-app checkbox by context path */
  appCheckbox: (contextPath: string) =>
    `[data-cy="branding-apply-branding-to-app-checkbox-${contextPath}"]`,
} as const;

// ---------------------------------------------------------------------------
// Subscribed applications widget
// ---------------------------------------------------------------------------
export const SubscribedApplicationsSelectors = {
  APP_TITLE: '[data-cy="c8y-subscribed-applications--app-title"]',
  SUBSCRIBE: '[data-cy="c8y-applications--subscribe"]',
  UNSUBSCRIBE: '[data-cy="c8y-applications--unsubscribe"]',
} as const;

// ---------------------------------------------------------------------------
// Feature configuration
// ---------------------------------------------------------------------------
export const FeatureConfigSelectors = {
  FEATURE_LIST: '[data-cy="feature-config--feature-list"]',
} as const;

// ---------------------------------------------------------------------------
// Help panel
// ---------------------------------------------------------------------------
export const HelpSelectors = {
  BTN: '[data-cy="help--help-btn"]',
  CONTENT: '[data-cy="help--c8y-help-content"]',
  DRAWER_BLOCK: '[data-cy="c8y-help--c8y-help-drawer-block"]',
  DRAWER_FOOTER: '[data-cy="c8y-help--c8y-help-drawer-footer"]',
  CLOSE: '[data-cy="c8y-help--close-btn"]',
  USER_GUIDE: '[data-cy="c8y-help--user-guide"]',
} as const;
