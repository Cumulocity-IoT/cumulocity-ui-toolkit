# Reminder Plugin Changelog

## 1.4.5

### Features

- **Context Filter Refactoring**: Refactored context filter availability to use Angular signals for improved reactive state management
  - Enhanced signal-based architecture for better performance and reactivity
  - Improved state synchronization for context-filtered reminders

### Changes

- **Configuration**: Updated config setter to accept boolean values for improved flexibility
- **State Management**: Synchronized open state and added robust JSON parsing for safer config handling

### Fixes

- **Tests**: Resolved linting issues in reminder service tests with proper ESLint disable comments

## 1.4.4

### Features

- **Internationalization (i18n) Support**: Complete migration to translatable strings with support for multiple languages
  - Added English (en) and German (de) locale files in JSON format
  - Generated corresponding `.po` (gettext) files for professional translation management
  - All UI labels, buttons, messages, and status indicators now use translation keys
  - All translation keys organized under `reminder.*` namespace, such as `reminder.actions.add`

### Changes

- **Component Templates**: Updated all component templates to use the `translate` pipe and `translate` service:
  - `reminder-drawer.component.html`: Replaced hard-coded strings with translation keys throughout filter labels, buttons, and messages
  - `reminder-indicator.component.html`: Updated tooltip text to use translation service with dynamic counter parameter
  - `reminder-modal.component.html`: Migrated modal title, labels, and buttons to translation system
  - `reminder-type.component.html`: Type names now use translation keys for consistency

- **Services**: Enhanced service layer for i18n support:
  - `reminder.service.ts`: Updated notification and alert messages to use translation service with support for translated reminder text and status labels
  - `reminder-modal.component.ts`: Form labels now use translation service for consistency

- **Models**: Extended data models:
  - Added `UNKNOWN` status to `ReminderStatus` enum for handling unknown reminder statuses gracefully

### Fixes

- **Indicator**: Fixed counter number missing when reaching ten or more due reminders
- **Text truncation**: Set some texts to truncate when reaching visual limits
