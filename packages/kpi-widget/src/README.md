# KPI Aggregator Widget

Aggregates inventory managed objects matching a configurable query and displays the results as bar charts, pie charts, or lists — with grouping, sorting, and real-time pagination.

## Features

- **Flexible display modes** — `aggregate` (sum values), `count` (count objects per group), `list` (flat table), `pieAggregate`, or `pieCount`.
- **Custom inventory queries** — Full Cumulocity inventory query syntax; supports context-aware placeholders (e.g. `[groupId]` resolved from the dashboard context).
- **Grouping & sorting** — Group by any inventory fragment path; sort ascending or descending by value or key.
- **Pagination & parallel loading** — Configurable page size, page limit, and number of parallel requests to tune throughput.
- **Pie chart legend** — Position the legend (`top`, `bottom`, `left`, `right`) and optionally show percentage labels in tooltips.
- **Run on load / manual** — Choose whether the widget auto-queries on page load or waits for a manual trigger.
- **Meta info** — Optionally display query duration and paging statistics for debugging.

## Widget configuration

Open the configuration panel to:

1. **Query** — Inventory query string. Use `[fragment.path]` placeholders to inject context data from the current dashboard.
2. **Page Size** — Items per request (1–2000).
3. **Page Limit** — Max pages to load initially; 0 = unlimited.
4. **Parallel Requests** — How many pages to fetch concurrently (1–10).
5. **Display Mode** — See feature list above.
6. **KPI Fragment** — The inventory fragment path to aggregate (e.g. `c8y_ActiveAlarmsStatus.major`).
7. **Group By** — Fragment path to group objects (e.g. `c8y_Hardware.model`).
8. **Label** — Fragment path to use as the group label in aggregate/pie modes.
9. **Sort / Order** — Sort by `value` or `key`; ascending or descending.
10. **Chart Legend Position** — For pie charts only.
11. **Background Color / Opacity** — Bar chart styling; defaults to the shell's brand primary colour.
12. **Show Percent** — Display percentage in pie chart tooltips.
13. **Show Meta Info** — Show query duration and pagination info.
14. **Run on Load** — Auto-execute query on widget render.

## Default widget size

| Width | Height |
|---|---|
| 6 columns | 8 rows |

## Module

`KpiAggregatorWidgetPluginProviders` — exported from `./src/app/kpi-widget/kpi-aggregator-widget.module.ts`

## Key internals

| Symbol | Purpose |
|---|---|
| `KpiAggregatorWidgetComponent` | Main widget — queries inventory and renders charts/lists |
| `KpiAggregatorWidgetConfigComponent` | Formly-based config form |
| `KpiAggregatorWidgetConfig` | Configuration model |
