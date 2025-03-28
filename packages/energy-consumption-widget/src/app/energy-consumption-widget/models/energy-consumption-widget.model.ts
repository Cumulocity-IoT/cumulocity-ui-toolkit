import { ISource } from '@c8y/client';

export const EnergyWidgetDateDisplayMode = {
  TOTAL: 'total',
  DELTA: 'delta',
} as const;

export type EnergyWidgetDateDisplayMode =
  (typeof EnergyWidgetDateDisplayMode)[keyof typeof EnergyWidgetDateDisplayMode];

export const EnergyWidgetDateRange = {
  WEEK: '7 days',
  MONTH: '4 weeks',
  YEAR: '12 months',
} as const;

export type EnergyWidgetDateRange =
  (typeof EnergyWidgetDateRange)[keyof typeof EnergyWidgetDateRange];

export const EnergyWidgetRangeType = {
  DATE: 'date',
  EVENT: 'event',
} as const;
export type EnergyWidgetRangeType =
  (typeof EnergyWidgetRangeType)[keyof typeof EnergyWidgetRangeType];

export interface EnergyConsumptionWidgetBaseConfig {
  displayMode: EnergyWidgetDateDisplayMode;
  device: ISource;
  digits: number;
  fragment: string;
  series: string;
  defaultRange: EnergyWidgetDateRange;
  barColor?: string;
  beginAtZero?: boolean;
}

export interface EnergyConsumptionWidgetDateConfig extends EnergyConsumptionWidgetBaseConfig {
  rangeType: 'date';
}

export interface EnergyConsumptionWidgetEventConfig extends EnergyConsumptionWidgetBaseConfig {
  rangeType: 'event';
  eventType: string;
}

export type EnergyConsumptionWidgetConfig =
  | EnergyConsumptionWidgetDateConfig
  | EnergyConsumptionWidgetEventConfig;
