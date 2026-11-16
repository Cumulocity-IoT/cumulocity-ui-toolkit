# KPI Trend Widget

Shows one measurement of a device as a large value with its trend over a time window. Two layouts:

- **Radial primary** (default): an arc gauge with the value against its maximum, and the trend
  sparkline as a strip below it. Use it when the ratio to the maximum matters.
- **Compact tile**: the value and the sparkline lead, and a 56 px ring beside them shows the value
  as a percentage of the maximum. Use it when recent movement matters most.

One widget shows one data point; place it several times on a dashboard for several KPIs.

## Features

- Current value from the device's latest measurement, then live from realtime updates
- Sparkline of the trend window (minutes, hours or days), drawn as the mean of equal intervals,
  so it has the same shape as a data point graph of the same series
- Trend percentage: the mean of the first interval against the mean of the last one, colored by
  whether a higher value is better
- Threshold colors from the data point's yellow and red ranges, as the platform's KPI widget
  applies them: a range needs both bounds and covers min ≤ value < max; red wins over yellow
- Accent color, icon, minimum and maximum can be set in the widget or come from the data point
- Stale marker when the newest measurement is older than one minute
- The widget fills its card: no scrollbar and no empty space; the radial gauge grows with the card
- Live preview in the configuration dialog
- German and English texts

## Configuration

The widget has two configuration sections.

**Data point** (the platform's data point selector): exactly one data point. From it the widget
takes the fragment and series, label, unit, color, min, max, and the yellow and red ranges.

**Appearance**:

| Setting         | Description                                                                       |
| --------------- | --------------------------------------------------------------------------------- |
| Layout variant  | Radial primary or Compact tile                                                    |
| Icon            | Icon beside the label; platform icons and uploaded icons work                      |
| Accent color    | Color of the gauge and the sparkline outside the threshold ranges; Reset returns to the data point's color |
| Min value       | Lower end of the gauge; default: the data point's min, then 0                     |
| Max value       | Upper end of the gauge; default: the data point's max. Without a maximum, no gauge is drawn |
| Trend window    | Period the sparkline and the trend percentage cover, ending at the newest value; default 1 hour |
| Sample count    | Number of equal intervals the window is split into (2 to 40, default 24)          |
| Trend direction | Whether an upward trend is good (green) or bad (red)                              |

**Device**: on a device type dashboard the widget reads the dashboard's device, as the platform's
KPI widget does. Otherwise it reads the data point's device, then the widget's device, then the
dashboard's device or context.

## Data loading

- **Current value**: `c8y_LatestMeasurements` of the device (`withLatestValues`), so the value
  shows before the first realtime update.
- **History**: one `GET /measurement/measurements/series` request for the whole trend window, with
  the `avg` and `count` aggregation functions, at the smallest round interval (5 s to 1 d) that
  keeps the window within 1,500 buckets: 5 s for one hour, 10 min for seven days. Round
  intervals matter: the API answered a seven-day window in 2 s at 10 min, but in 24 s at 605 s.
- **Realtime**: subscribed together with the two reads, so values created while they load are not
  lost. Each new value updates the current value and is added to its bucket; the window then ends
  at that value and the interval means are recomputed. History is not fetched again while the
  widget is on screen.
- In the configuration preview, the history read waits 400 ms after the last edit.

## Limitations

- One data point per widget
- The sparkline has no tooltip
- The widget id is `windy.kpi-trend`, from the widget's first home in the DER Add-on, so
  dashboards created there keep working with this plugin

## Development

From the repository root:

```bash
pnpm run serve:kpi-trend-widget   # needs C8Y_BASEURL and C8Y_SHELL_TARGET
pnpm run build:kpi-trend-widget
pnpm run test:kpi-trend-widget    # Karma unit tests
pnpm run e2e:mock kpi-trend-widget --browser=chrome   # Cypress against the tenant mock
```

Built on Cumulocity Web SDK 1024.21.x and Angular 21. The plugin exports
`KpiTrendWidgetPluginProviders` (context path `ps-iot-pkg-kpi-trend-widget-plugin`).

---

These tools are provided as-is and without warranty or support. They do not constitute part of
the Cumulocity product suite. Users are free to use, fork and modify them, subject to the license
agreement. While Cumulocity welcomes contributions, we cannot guarantee to include every
contribution in the main project.
