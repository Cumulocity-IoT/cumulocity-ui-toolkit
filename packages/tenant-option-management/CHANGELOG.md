# Tenant Option Management Changelog

## 2.0.0

### Breaking Changes

- Built for Cumulocity Web SDK 1024.21.x / Angular 21: needs a cockpit on 1024 or newer (part of toolkit release v1.0.0). Stay on 1.0.6 for 1023 shells.

### Features

- **Bulk-import a category**: in the "Add existing" dialog the key is now optional. Leaving it empty adds every existing tenant option of the entered category to the managed list in one step. Options that are already managed are skipped instead of failing the import, and a message reports how many options were added (or that all were already managed). Contributed by `CGuether` (#92).

### Bug Fixes

- Errors in the "Add existing" dialog now show the actual error message instead of an empty object.
- File import continues past options that fail (e.g. no permission), marks them as failed and stays open with a summary; the spinner no longer hangs.
- File entries without a text `value` are skipped with the other invalid entries, and Import cannot be started twice.
- The JSON editor reports its value to forms and marks them touched (typed with `@types/jsoneditor`).
