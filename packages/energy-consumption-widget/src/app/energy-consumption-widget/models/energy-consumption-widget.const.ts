import {
  EnergyWidgetDateRange,
  EnergyWidgetDateDisplayMode,
  EnergyWidgetRangeType,
} from './energy-consumption-widget.model';

type FormlySelectOptions = {
  label: string;
  value: string | number | boolean;
  group?: string;
};

export const ENERGY_CONSUMPTION_WIDGET__RANGE_TYPE_OPTIONS: FormlySelectOptions[] = [
  { value: EnergyWidgetRangeType.DATE, label: '🗓️ By Date Range' },
  // { value: EnergyWidgetRangeType.EVENT, label: '📌 By Event' }, // currently not supported
] as const;

export const ENERGY_CONSUMPTION_WIDGET__DISPLAY_CONFIG_OPTIONS: FormlySelectOptions[] = [
  { value: EnergyWidgetDateDisplayMode.TOTAL, label: '📈 Total' },
  { value: EnergyWidgetDateDisplayMode.DELTA, label: '📊 Delta' },
] as const;

export const ENERGY_CONSUMPTION_WIDGET__DATE_RANGE: FormlySelectOptions[] = [
  { value: EnergyWidgetDateRange.WEEK, label: 'Last 7 Days' },
  { value: EnergyWidgetDateRange.MONTH, label: 'Last 4 Weeks' },
  { value: EnergyWidgetDateRange.YEAR, label: 'Last 12 Months' },
] as const;

export const ENERGY_CONSUMPTION_WIDGET__DEFAULT_CHART_CONFIG = {
  scales: {
    x: {},
    y: {
      beginAtZero: false,
    },
  },
  plugins: {
    legend: {
      display: false,
    },
  },
};
