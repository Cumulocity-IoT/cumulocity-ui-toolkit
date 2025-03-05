import { LayoutPosition } from 'chart.js';

// sort options
export const KpiAggregatorWidgetSort = {
  label: 'label',
  value: 'value',
};
export type KpiAggregatorWidgetSort =
  (typeof KpiAggregatorWidgetSort)[keyof typeof KpiAggregatorWidgetSort];

// order options
export const KpiAggregatorWidgetOrder = {
  asc: 'asc',
  desc: 'desc',
};
export type KpiAggregatorWidgetOrder =
  (typeof KpiAggregatorWidgetOrder)[keyof typeof KpiAggregatorWidgetOrder];

// display options
export const KpiAggregatorWidgetDisplay = {
  aggregate: 'aggregate',
  count: 'count',
  list: 'list',
  pieAggregate: 'pieAggregate',
  pieCount: 'pieCount',
};
export type KpiAggregatorWidgetDisplay =
  (typeof KpiAggregatorWidgetDisplay)[keyof typeof KpiAggregatorWidgetDisplay];

// widget config
export interface KpiAggregatorWidgetConfig {
  query: string;
  pageSize: number;
  pageLimit: number;
  color: string;
  opacity: number;
  showMeta: boolean;
  display: KpiAggregatorWidgetDisplay;
  sort: KpiAggregatorWidgetSort;
  order: KpiAggregatorWidgetOrder;
  percent: boolean;
  runOnLoad: boolean;
  parallelRequests: number;
  groupBy?: string;
  kpiFragment?: string;
  label?: string;
  chartLegendPosition?: LayoutPosition;
}

// chart options
export const KpiAggregatorWidgetChartLegendPosition = {
  top: 'top',
  right: 'right',
  bottom: 'bottom',
  left: 'left',
};
export type KpiAggregatorWidgetChartLegendPosition =
  (typeof KpiAggregatorWidgetChartLegendPosition)[keyof typeof KpiAggregatorWidgetChartLegendPosition];

// form elements
export type KpiAggregatorWidgetOptions = {
  label: string;
  value: string | number | boolean;
  group?: string;
};
