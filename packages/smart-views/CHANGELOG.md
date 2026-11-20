# Smart Views Plugin Changelog

## 0.2.0

### Features

- The navigator updates as soon as a smart view is created, renamed or deleted — no page reload needed
- Error and confirmation messages are translatable

### Bug Fixes

- Searching or filtering a smart view no longer drops the view's own query: results stay limited to the view's assets (a stored query without outer parentheses was previously ignored entirely)
- The smart view page shows a clear message for an ID that is not a smart view configuration instead of an empty title
- Editing a smart view keeps its stored (possibly hand-written) query unless the asset definition changes, and cannot save `type eq ''` while definitions are still loading.
- Quotes in asset definition names are escaped in the query.
- CSV export: header cells are escaped, repeated headers are numbered instead of dropping columns, cells that would run as spreadsheet formulas are neutralised, and Excel reads umlauts (UTF-8 byte order mark).
- Switching smart views or asset definitions quickly shows the latest selection, and one failed load no longer stops the navigator from updating.

### Dependencies

- Runs on Cumulocity Web SDK 1024.21.x / Angular 21 (deployed with the explicit context path `cumulocity-smart-views-plugin`)

## 0.1.0

- Initial release: smart view pages per configuration, configuration page under Settings (create, edit, delete, DTM-derived columns) and CSV export
