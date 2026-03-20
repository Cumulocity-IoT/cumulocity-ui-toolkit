import { IManagedObject } from '@c8y/client';
import { KPIDetails } from '@c8y/ngx-components/datapoint-selector';

export interface ThresholdConfig {
  showMin: boolean;
  minColor: string;
  showMax: boolean;
  maxColor: string;
}

export interface LineChartWidgetConfig {
  aggregationFunctions: string[];
  datapoints: KPIDetails[];
  device: IManagedObject;
  thresholdConfigs: Record<string, ThresholdConfig>;
}

export interface ThresholdLine {
  name: string;
  value: number;
  color: string;
}
