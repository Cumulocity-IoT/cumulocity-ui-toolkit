# Release Notes — Admin Plugin

Provides an administration interface inside the Cumulocity **Settings** section for managing release notes entries. Pairs with the [Release Notes Display Plugin](../display-plugin/README.md) which surfaces release notes to end users.

## Features

- **Create** — Compose new release notes with a version number, publication date, and Markdown body.
- **Edit** — Update existing entries inline via a modal form.
- **Publish / Unpublish** — Toggle the published state of any release note without deleting it.
- **Delete** — Remove outdated entries with a single click.
- **Markdown preview** — Live preview panel renders the Markdown body as HTML before saving.
- **New-release check** — On plugin initialisation the service automatically checks whether users have unseen releases.

## Navigation

Registers a **Release Notes** settings page under `Settings → Release Notes` (path `/release-notes-admin`).

## Module

`ReleaseNotesAdminPluginProviders` — exported from `./src/app/plugin/release-notes-admin-plugin.module.ts`

## Key internals

| Symbol | Purpose |
|---|---|
| `ReminderNotesAdminListComponent` | List view with publish/unpublish, edit, and delete actions |
| `ReminderNotesAdminModalComponent` | Create / edit modal with Formly form and Markdown preview |
| `ReleaseNotesService` | CRUD operations against the Cumulocity inventory |
