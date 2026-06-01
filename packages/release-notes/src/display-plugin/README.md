# Release Notes — Display Plugin

Surfaces published release notes to end users via a right-side drawer menu item and a full-screen list modal. Pairs with the [Release Notes Admin Plugin](../admin-plugin/README.md).

## Features

- **Drawer menu item** — Injects a **Release Notes** link into the Cumulocity right drawer (below the UI settings entry, priority 100).
- **Modal list** — Opens a modal showing all published release notes in reverse-chronological order, rendered as Markdown HTML.
- **New-release badge** — On plugin initialisation the service checks whether there are unpublished releases the user has not yet seen; optionally highlights the menu item.
- **Last-seen tracking** — Records the timestamp of the user's last visit so "new" indicators update automatically.

## Module

`ReleaseNotesPluginProviders` — exported from `./src/app/plugin/release-notes-plugin.module.ts`

## Key internals

| Symbol | Purpose |
|---|---|
| `ReleaseNotesMenuItemComponent` | Drawer button that opens the modal |
| `ReleaseNotesDisplayListModalComponent` | Full list of published release notes rendered as Markdown |
| `ReleaseNotesService` | Loads published entries, tracks last-seen, and fires the new-release check |
