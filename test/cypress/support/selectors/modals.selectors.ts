/**
 * Selectors for Cumulocity modal dialogs:
 *   - Confirm modal
 *   - Select modal
 *   - Prompt alert
 *
 * Sources: cumulocity-ui packages + cypress/e2e tests
 */

// ---------------------------------------------------------------------------
// Confirmation modal (c8y-confirm-modal)
// ---------------------------------------------------------------------------
export const ConfirmModalSelectors = {
  /** Confirms / accepts the dialog */
  OK: '[data-cy="c8y-confirm-modal--ok"]',
  /** Cancels / dismisses the dialog */
  CANCEL: '[data-cy="c8y-confirm-modal--cancel"]',
  /** Generic confirm button (legacy `modal-confirm-btn`) */
  CONFIRM_BTN: '[data-cy="modal-confirm-btn"]',
  /** Button by title — returns the selector for a button inside a c8y-confirm-modal */
  button: (title: string) => `c8y-confirm-modal button[title="${title}"]`,
} as const;

// ---------------------------------------------------------------------------
// Select modal (c8y-select-modal / item selector)
// ---------------------------------------------------------------------------
export const SelectModalSelectors = {
  SAVE: '[data-cy="select-modal--Save-button"]',
  CANCEL: '[data-cy="select-modal--Cancel-button"]',
} as const;

// ---------------------------------------------------------------------------
// Prompt / alert banner
// ---------------------------------------------------------------------------
export const PromptSelectors = {
  ALERT: '[data-cy="c8y-prompt--alert"]',
  ALERT_LEGACY: '[data-cy="prompt-alert"]',
} as const;

// ---------------------------------------------------------------------------
// Generic alert / toast message
// ---------------------------------------------------------------------------
export const AlertSelectors = {
  MESSAGE: '[data-cy="c8y-alert--message"]',
  CLOSE: '[data-cy="alert--close-alert-message"]',
} as const;

// ---------------------------------------------------------------------------
// Item selector component (c8y-item-selector)
// ---------------------------------------------------------------------------
export const ItemSelectorSelectors = {
  DROPDOWN_TOGGLE: '[data-cy="c8y-item-selector--dropdown-toggle"]',
  APPLY: '[data-cy="c8y-item-selector--apply-button"]',
  SELECT_ALL: '[data-cy="c8y-item-selector--select-all"]',
  ITEM: '[data-cy="c8y-item-selector--item"]',
} as const;

// ---------------------------------------------------------------------------
// Popover confirm (inline delete confirmation)
// ---------------------------------------------------------------------------
export const PopoverConfirmSelectors = {
  REMOVE: '[data-cy="popover-confirm--Remove"]',
} as const;
