# Smart Views Plugin Changelog

## 0.2.0

### Features

- The navigator updates as soon as a smart view is created, renamed or deleted — no page reload needed
- Error and confirmation messages are translatable

### Bug Fixes

- Searching or filtering a smart view no longer drops the view's own query: results stay limited to the view's assets (a stored query without outer parentheses was previously ignored entirely)
- The smart view page shows a clear message for an ID that is not a smart view configuration instead of an empty title

### Dependencies

- Runs on Cumulocity Web SDK 1024.21.x / Angular 21 (deployed with the explicit context path `cumulocity-smart-views-plugin`)

## 0.1.0

- Initial release: smart view pages per configuration, configuration page under Settings (create, edit, delete, DTM-derived columns) and CSV export
