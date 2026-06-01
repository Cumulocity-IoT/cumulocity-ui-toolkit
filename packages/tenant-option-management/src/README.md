# Tenant Option Management Plugin

A Cumulocity **Settings** page for viewing, creating, editing, importing, and exporting tenant options with full JSON editor support.

## Features

- **List all options** — Displays tenant options from the configured allow-list alongside their current values, last-updated timestamp, and owner.
- **Add options** — Create new tenant options via a modal supporting both plain-text and JSON input tabs.
- **Edit options** — Modify existing values inline through the same modal.
- **Delete options** — Remove options after a confirmation dialog.
- **Import from allow-list** — Add an option to the allow-list (key + category) without setting a value.
- **Bulk import from file** — Upload a JSON export file, resolve conflicts interactively, and import multiple options at once.
- **Export to JSON** — Select options from the allow-list and download them as a JSON file for backup or transfer.
- **JSON editor** — Full-featured `jsoneditor` component for editing complex JSON tenant option values with schema validation.
- **Encrypted option support** — Handles encrypted options transparently.

## Navigation

Registers an **Options** settings page under `Settings → Options` (path `/tenant-option-management`, cloud-settings icon).

## Module

`TenantOptionManagementProviders` — exported from `./src/app/modules/tenant-option-management/tenant-option-management.module.ts`

## Key internals

| Symbol | Purpose |
|---|---|
| `TenantOptionManagementComponent` | Main data grid view with action controls |
| `AddOptionModalComponent` | Create / edit modal with text and JSON tabs |
| `ImportOptionModalComponent` | Allow-list import modal |
| `FileImportModalComponent` | Bulk file import with conflict resolution |
| `ExportModalComponent` | Export selection modal with JSON download |
| `JsonEditorComponent` | Wrapper around the `jsoneditor` library |
| `TenantOptionManagementService` | Reads/writes tenant options and the allow-list configuration |
