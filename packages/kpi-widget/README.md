# Cumulocity IoT UI KPI Aggregator Widget Plugin

![Screencapture of the widget, demoing a change in config and the loading of a second batch of pages.](./public/preview.gif)

The KPI aggregator widget allows you to quickly configure and visualize queries againt the inventory API, and count or aggregate single result fragments, on client side (in the browser).

## Features

The widget can be [configured](#widget-config) to query inventory managed objects, based on [the filter query langugage](https://cumulocity.com/api/core/10.18.0/#tag/Query-language), enhanced with [context sensitive query parameters](#context-sensitive-queries).

For visualization, [three display modes](#display-modes) are avilable: a "bar chart" – or rather a listing with the percentual value represented as background-color –, a pie chart and a table – listing all queried assets.

To be able to control the potential pandoras box of queries, options to limit the number of results per request, the number of parallel requests and requests per page are configurable, as well as an option to only run the query on demand.

### Display Modes

Currently, five display modes are available. Functional, both aggregation and counting views share identical configurations and provide two visualisation flavours: 📊 bar and 🍰 pie chart.

![A screenshot showing both "aggreation" display options, pie and bar chart, of the widget side by side, demoing the aggreation critical alarms by device type.](./public/screenshot-aggregation.jpg)  
<small>Display aggregated values: bar chart (left) and pie chart (right).</small>

![A screenshot of the widget presenting both the pie and bar chart display "counting" variants, exemplary for device types.](./public/screenshot-counting.jpg)  
<small>Display counted values: bar chart with percent values (left) and pie chart (right).</small>

![Another screenshot, taken from the "table" display variant of the widget, rendering each device, with additional information, as a separate row within a table.](./public/screenshot-table.jpg)  
<small>Display mode table: each queried device is listed.</small>

### Meta Information

![Screenshot of the widget highlighting the result paging information – 28 results, page 1 of 1 –, at the top, and query duration – 111 milliseconds –, at the bottom.](./public/screenshot-meta-info.png)  
<small>Highlighted request meta information: Paging (top) and duration of query (bottom).</small>

![A screesnhot of the additional paging information – current page, configured page limit and total avilable pages –, in a tooltip.](./public/screenshot-meta-pageinfo.jpg)  
<small>Paging detail information in tooltip</small>

### Additional Actions

![A Screenshot of the actions menu opened, exposing buttons to triggers to load the next batch (set of pages) and refresh the view.](./public/screenshot-drop-down-menu.jpg)  
<small>The drop down menu provides access to actions, such as refreshing the data.</small>

### Widget Config

![Screenshot of the widget config, presenting options to adjust the query, its pagination and different display details.](./public/screenshot-config.jpg)

#### Context sensitive queries

It is possible to user "context sensitive" parameters within your query. This means that parts of your query can be replaced by values from the managed object of your dashboard context, for example: if you would want to display a list of devices from the same owner – that hosts the dashboard – you can use the query `owner eq "[owner]"`. `[owner]` will then be replaced by the devices types, so that the actual request would read `owner eq "your.email@host.net"`.

Ht econtext sensitive parameter can also address fragments of objects, such as `[c8y_Hardware.model]` or `[c8y_Availability.status]`. Please note that it is currently not possible to traverse arrays this way.

#### Useful config samples

- Count all devices by type
  - Query: `has(c8y_IsDevice)`
  - Display Mode: `Bar Chart: Count Entries`
  - KPI Fragment: `type`
  - Group by: `type`
  - Sort: `by Value`
  - Order: `Descending`
  - `Show Meta Info` and `Run on Load` checked
- Aggregate critical alarms by device type
  - Query: `has(c8y_IsDevice)`
  - Display Mode: `Pie Chart: Aggregate Entries`
  - KPI Fragment: `c8y_ActiveAlarmsStatus.major`
  - Group by: `type`
  - Label: `type`
  - Sort: `by Value`
  - Order: `Descending`
  - `Show Percent` and `Run on Load` checked

---

<!--
## Installation and update

_TBD_

---

-->

## Local Development

### Recommended version

- node v 16.x
- npm v 9.x

### Plugin versions

- Angular v 14.x
- WebSDK v 1018.0.x

### How to start

Change the target tenant and application you want to run this plugin on in the `package.json`.

```bash
c8ycli server -u https://{{your-tenant}}.cumulocity.com/ --shell {{cockpit}}
```

Keep in mind that this plugin needs to have an app (e.g. cockpit) running with at least the same version as this plugin. if your tenant contains an older version, use the c8ycli to create a cockpit clone running with **at least version 1016.0.59**! Upload this clone to the target tenant (e.g. cockpit-1016) and reference this name in the `--shell` command.

The widget plugin can be locally tested via the start script:

```bash
npm start
```

In the Module Federation terminology, `widget` plugin is called `remote` and the `cockpit` is called `shell`. Modules provided by this `widget` will be loaded by the `cockpit` application at the runtime. This plugin provides a basic custom widget that can be accessed through the `Add widget` menu.

> Note that the `--shell` flag creates a proxy to the cockpit application and provides `KpiAggregatorWidgetPluginModule` as an `remote` via URL options.

Also deploying needs no special handling and can be simply done via `npm run deploy`. As soon as the application has exports it will be uploaded as a plugin.

---

This widget is provided as-is and without warranty or support. They do not constitute part of the Cumulocity product suite. Users are free to use, fork and modify them, subject to the license agreement. While Cumulocity welcomes contributions, we cannot guarantee to include every contribution in the master project.

<!-- <:3  )~~ -->
