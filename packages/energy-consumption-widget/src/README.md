# Energy Consumption Widget

Displays cumulative energy consumption over configurable time ranges as a bar chart, sourced from Cumulocity measurements.

## Features

- **Multiple range types** — Choose between date-based ranges (hours, days, weeks, months) or event-triggered ranges.
- **Display modes** — Show cumulative totals or per-period deltas.
- **Configurable measurement fragment** — Select any measurement fragment, series, and type from the device.
- **Chart customisation** — Configure bar colour, Y-axis zero-baseline, and rounding precision.
- **Expose range selector** — Optionally surface a runtime range-select dropdown on the widget for end users.

## Widget configuration

Open the configuration panel to:

1. **Range Type** — `date` (time-based milestones) or `event` (event-type-triggered).
2. **Event Type** — Required when Range Type is `event`; the Cumulocity event type to look for.
3. **Display Mode** — `total` (absolute cumulative value) or `delta` (difference between adjacent milestones).
4. **Default Range** — Pre-selected time range shown on load (e.g. `7 days`, `4 weeks`, `12 months`).
5. **Expose Range Select** — Toggle to show/hide the range-select dropdown in the widget header.
6. **Measurement Type / Fragment / Series** — Point to the correct inventory fragment path.
7. **Rounding Digits** — Number of decimal places for displayed values.
8. **Bar Color** — Hex colour override; falls back to the shell's `--brand-light` CSS variable.
9. **Begin Scale at Zero** — Whether the Y-axis starts at 0 (total display mode only).

## Default widget size

| Width | Height |
|---|---|
| 6 columns | 6 rows |

## Module

`EnergyConsumptionWidgetPluginProviders` — exported from `./src/app/energy-consumption-widget/energy-consumption-widget.module.ts`

## Key internals

| Symbol | Purpose |
|---|---|
| `EnergyConsumptionWidgetComponent` | Main widget — fetches measurements and renders bar chart |
| `EnergyConsumptionWidgetConfigComponent` | Formly-based config form |
| `EnergyConsumptionWidgetConfig` | Configuration model |
