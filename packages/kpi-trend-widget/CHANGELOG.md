# KPI Trend Widget Changelog

## 1.0.0

### Features

- Moved into the UI Toolkit monorepo from the DER Add-on (c8y-windy-solution). The widget id stays
  `windy.kpi-trend`, so existing dashboards keep working once this plugin replaces the old one.
- Radial primary and Compact tile layouts, with a sparkline of the trend window, threshold colors
  from the data point's ranges, a stale marker and a live preview in the configuration dialog.
- The history is one aggregated series request per trend window, followed by realtime updates.

### Breaking Changes

- New package name `cumulocity-kpi-trend-widget-plugin` and context path
  `ps-iot-pkg-kpi-trend-widget-plugin`. Remove the DER Add-on's "KPI Trend Widget" plugin
  (`wnd-pkg-kpi-trend-widget-plugin`) from an application before adding this one; with both
  installed, the widget is registered twice.
