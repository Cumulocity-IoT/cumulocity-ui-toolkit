# Events Graph Widget Changelog

## 3.1.0

### Features

- **Shared time cursor**: hovering the chart draws a vertical line across all event types, and a readout above the chart lists the state of every row at that moment, to correlate the event types
- **Rows from several devices**: on a group dashboard each event type row can take its events from a device of that group (new "Device" select in the config, default: the group itself), so states of different devices line up on one time axis; such rows are labelled `<type> · <device>`. Devices that are no longer in the group are dropped from the config when it is edited.
- Rows are shown top-down in the configured order (previously the first configured type was the bottom row)

### Bug Fixes

- Bars start at their event's time; they were chained from the start of the time box, so states showed hours too early.
- The state before the time box is shown even when nothing changed inside it, however long ago it started.
- More than 2000 events per row are paged, newest first, so the current state is never cut off.
- Event texts are escaped in the tooltip (device-supplied text was rendered as HTML).
- "Disable auto refresh" pauses the countdown; a manual refresh does not restart it.
- A slow, older load no longer overwrites a newer one; rows load in parallel; the x axis is a time axis ending at "now".

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
