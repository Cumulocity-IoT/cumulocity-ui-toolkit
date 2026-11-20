# Reminder Plugin Changelog

## 1.5.2

### Features

- **Link Override**: `ReminderTenantConfig` now supports an optional `linkOverride` map, keyed by `ReminderType.id`, to replace the default `/device/{id}` or `/group/{id}` asset link (drawer, toast, and browser notification) with a custom route containing an `{id}` placeholder.

## 1.5.1

### Features

- **Notifications**: Browser notifications are now sent grouped per source, show the reminder type in the body, and announce all reminders due at the same time
- **Drawer**: The last update is now shown with an explicit date format

### Performance

- **Polling instead of realtime subscription**: Replaced the tenant-wide realtime event subscription (`EventRealtimeService.onAll$()`), which delivered unrelated events at high volume on busy tenants and triggered a full change-detection cycle per message, with polling: reminders are loaded every 30 s, on tab visibility (5 s minimum gap), after an update, and after creating a reminder, with concurrent refreshes sharing the load in flight
  - Due counts are computed from memory where possible, and only re-queried when the list changed, the counter is outdated, or it's older than 5 minutes
  - Due reminders are announced from a single place, in the active tab only, with a shared `localStorage` record so multiple tabs don't repeat each other
  - Drawer re-digest is skipped when only a reminder's computed diff changes, so unrelated UI doesn't regroup

### Fixes

- **Asset links**: Fixed the drawer's device/group footer links not navigating (missing `RouterLink` import)
- **Drawer date format**: Fixed the header date rendering a literal `"DD"` by using Angular `DatePipe` symbols (`'dd.MM.yyyy'`) instead of moment-style ones
- **Optimistic updates**: The drawer now reverts a reminder's optimistic status if an update request fails
- **Realtime updates**: Reminder view updates are now throttled (not debounced) and no longer processed for tenant-wide no-op deletes unrelated to reminders

## 1.5.0

- update to c8y 1023.14 (2026-lts)

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
