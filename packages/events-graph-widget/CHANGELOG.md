# Events Graph Widget Changelog

## 3.0.0

### Breaking Changes

- Ported to Cumulocity Web SDK 1024.21.x and Angular 21; it needs a shell on 1024 or newer
- The plugin exports the provider array `EventsGraphWidgetPluginProviders` (the old `EventsGraphWidgetModule` name stays as a deprecated alias) and has the explicit context path `ps-iot-pkg-events-graph-widget-plugin`

### Features

- Moved into the UI Toolkit monorepo (continues PR #34)
- Empty states when no device is selected or no event type is configured, and an error state when the events cannot be loaded — previously the widget stayed blank
- Tooltip labels (Text, Start date, End date, Duration) are translated

### Bug Fixes

- Config changes are made on the widget's configuration object itself, so all of them are saved
- Event types with an empty type are skipped instead of querying all events of the device
- The echarts components used by the chart (custom series, tooltip, legend, zoom) are registered explicitly instead of bundling the whole echarts library

### Dependencies

- echarts 6.1.0, ngx-echarts 21, date-fns 4; the unused `ngx-color-picker` dependency was removed (the config form uses the native color input)
- The widget no longer enables the dashboard's global time context, which it never used

## 2.0.1

- Last release from the standalone repository (Web SDK 1017)
