import {
  EnergyWidgetDateDisplayMode,
  EnergyWidgetDateRange,
  EnergyWidgetRangeType,
} from './energy-consumption-widget.model';
import { gettext } from '@c8y/ngx-components/gettext';
import { FormlySelectOption } from '~models/formly.model';

export const ENERGY_CONSUMPTION_WIDGET__RANGE_TYPE_OPTIONS: FormlySelectOption[] = [
  { value: EnergyWidgetRangeType.DATE, label: gettext('🗓️ By Date Range') },
  // { value: EnergyWidgetRangeType.EVENT, label: gettext('📌 By Event') }, // currently not supported
] as const;

export const ENERGY_CONSUMPTION_WIDGET__DISPLAY_CONFIG_OPTIONS: FormlySelectOption[] = [
  { value: EnergyWidgetDateDisplayMode.TOTAL, label: gettext('📈 Total') },
  { value: EnergyWidgetDateDisplayMode.DELTA, label: gettext('📊 Delta') },
] as const;

export const ENERGY_CONSUMPTION_WIDGET__DATE_RANGE: FormlySelectOption[] = [
  { value: EnergyWidgetDateRange.HOUR_12, label: gettext('Last 12 Hours') },
  { value: EnergyWidgetDateRange.DAY_7, label: gettext('Last 7 Days') },
  { value: EnergyWidgetDateRange.WEEK_4, label: gettext('Last 4 Weeks') },
  { value: EnergyWidgetDateRange.MONTH_12, label: gettext('Last 12 Months') },
] as const;

export const ENERGY_CONSUMPTION_WIDGET__DEFAULT_DATE_RANGE = EnergyWidgetDateRange.DAY_7;

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
