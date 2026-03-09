import { ISource } from '@c8y/client';
import { KPIDetails } from '@c8y/ngx-components/datapoint-selector';

type ObjectValues<T> = T[keyof T];

export const AdvancedRadialGaugeChartMarkerType = {
  line: 'line',
  triangle: 'triangle',
} as const;

const AdvancedRadialGaugeChartColor = {
  green: 'green',
  orange: 'orange',
  red: 'red',
} as const;

// type exports
export type AdvancedRadialGaugeChartColor = ObjectValues<typeof AdvancedRadialGaugeChartColor>;

export type AdvancedRadialGaugeChartMarker = {
  color: string;
  type: AdvancedRadialGaugeChartMarkerType;
  size?: number;
  label?: string;
};

export type AdvancedRadialGaugeChartMarkerType = ObjectValues<
  typeof AdvancedRadialGaugeChartMarkerType
>;

export type AdvancedRadialGaugeChartThreshold = {
  color: AdvancedRadialGaugeChartColor;
  bgOpacity?: number;
};

export type AdvancedRadialGaugeChartConfig = {
  min?: number;
  max?: number;
  unit?: string;
  thresholds: {
    [key: string]: AdvancedRadialGaugeChartThreshold;
  };
  markers: {
    [key: string]: AdvancedRadialGaugeChartMarker;
  };
};

export interface AdvancedRadialGaugeConfig {
  datapoint: KPIDetails;
  device: ISource;
}

// const exports
export const ADVANCED_RADIAL_GAUGE_CHART_CONFIG: AdvancedRadialGaugeChartConfig = {
  min: 0,
  max: 100,
  unit: '',
  thresholds: {},
  markers: {},
};
