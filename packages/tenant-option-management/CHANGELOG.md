# Tenant Option Management Changelog

## 1.1.0

### Features

- **Bulk-import a category**: in the "Add existing" dialog the key is now optional. Leaving it empty adds every existing tenant option of the entered category to the managed list in one step. Options that are already managed are skipped instead of failing the import, and a message reports how many options were added (or that all were already managed). Contributed by `CGuether` (#92).

### Bug Fixes

- Errors in the "Add existing" dialog now show the actual error message instead of an empty object.
