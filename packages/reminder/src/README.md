# Reminder Plugin

Adds a personal reminder system to Cumulocity. Users can create time-based reminders attached to any device or asset and receive in-app notifications when they are due.

## Features

- **Create reminders** — A modal form lets users attach a reminder to any device or asset, set a due date/time, add a free-text message, and optionally assign a reminder type.
- **Reminder drawer** — A collapsible right-side panel lists all active reminders, grouped by status (active, snoozed, cleared).
- **Status updates** — Mark reminders as cleared or snoozed directly from the drawer.
- **Context filter** — Optionally filter the drawer to reminders attached to the asset whose detail page is currently open.
- **Type filter** — Filter reminders by custom reminder types configured by administrators.
- **Toast and browser notifications** — Configurable notification channels when a reminder becomes due. Only the last focused tab notifies; announced reminders are shared across tabs via local storage, so switching tabs neither repeats nor drops a notification. Reminders that became due more than 2 minutes ago (e.g. while the computer was asleep) are not announced.
- **Configurable reminder types** — Administrators can define custom types stored as tenant options.
- **Polling updates** — Reloads reminders every 30 s, when the tab becomes visible, and after creating or updating a reminder. The tenant-wide `/events/*` realtime channel is not used: it cannot be filtered by type, and on busy tenants each message triggers a full change detection cycle.

## Action bar integration

The plugin injects a **reminder counter badge** (`ReminderIndicatorComponent`) into the Cumulocity action bar. The badge shows the number of active reminders and opens the reminder drawer on click.

## Module

`ReminderPluginProviders` — exported from `./src/app/reminder-plugin/reminder-plugin.module.ts`

## Key internals

| Symbol | Purpose |
|---|---|
| `ReminderIndicatorComponent` | Action-bar badge with counter and drawer toggle |
| `ReminderDrawerComponent` | Collapsible side panel listing all reminders |
| `ReminderModalComponent` | Create-reminder modal with device picker, date/time, and text fields |
| `ReminderTypeComponent` | Inline badge rendering a reminder's type label |
| `ReminderService` | Core service: CRUD, grouping, polling, and config persistence |
