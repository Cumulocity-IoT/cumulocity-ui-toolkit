import {
  KpiAggregatorWidgetConfig,
  KpiAggregatorWidgetDisplay,
  KpiAggregatorWidgetOptions,
  KpiAggregatorWidgetOrder,
  KpiAggregatorWidgetSort,
} from './kpi-aggregator-widget.model';
import { gettext } from '@c8y/ngx-components/gettext';

// select options
export const KPI_AGGREGATOR_WIDGET__DISPLAY_OPTIONS: KpiAggregatorWidgetOptions[] = [
  {
    value: 'aggregate',
    label: gettext('Bar Chart: Aggregate Values'),
    group: gettext('📊 Bar Chart'),
  },
  { value: 'count', label: gettext('Bar Chart: Count Entries'), group: gettext('📊 Bar Chart') },
  {
    value: 'pieAggregate',
    label: gettext('Pie Chart: Aggregate Values'),
    group: gettext('🍰 Pie Chart'),
  },
  { value: 'pieCount', label: gettext('Pie Chart: Count Entries'), group: gettext('🍰 Pie Chart') },
  { value: 'list', label: gettext('Table') },
] as const;

// sort options
export const KPI_AGGREGATOR_WIDGET__SORT_OPTIONS: KpiAggregatorWidgetOptions[] = [
  { value: 'label', label: gettext('by Label') },
  { value: 'value', label: gettext('by Value') },
] as const;

// order options
export const KPI_AGGREGATOR_WIDGET_ORDER_OPTIONS: KpiAggregatorWidgetOptions[] = [
  { value: 'asc', label: gettext('↗️ Ascending') },
  { value: 'desc', label: gettext('↘️ Descending') },
] as const;

// chart legend position options
export const KPI_AGGREGATOR_WIDGET__CHART_LEGEND_POSITION_OPTIONS: KpiAggregatorWidgetOptions[] = [
  { value: 'top', label: gettext('⬆️ Top') },
  { value: 'right', label: gettext('➡️ Right') },
  { value: 'bottom', label: gettext('⬇️ Bottom') },
  { value: 'left', label: gettext('⬅️ Left') },
] as const;

export const KPI_AGGREGATOR_WIDGET__DEFAULT_CONFIG: KpiAggregatorWidgetConfig = {
  query: '',
  pageSize: 100,
  pageLimit: 3,
  groupBy: '',
  label: gettext(''),
  kpiFragment: '',
  color: '#27b3ce',
  opacity: 30,
  showMeta: true,
  display: KpiAggregatorWidgetDisplay.aggregate,
  sort: KpiAggregatorWidgetSort.value,
  order: KpiAggregatorWidgetOrder.desc,
  percent: false,
  runOnLoad: false,
  parallelRequests: 1,
  chartLegendPosition: 'top',
};
