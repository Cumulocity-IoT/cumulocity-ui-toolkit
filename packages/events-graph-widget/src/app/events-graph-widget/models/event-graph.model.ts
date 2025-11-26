import { IEvent } from '@c8y/client';

export type EventStatusTrackerConfig = {
  hours: number;
  realtime: boolean;
  realtimeInterval: number;
  device: {
    id: string;
    name: string;
  };
  types: EventTypeConfig[];
};

export type EventConfig = {
  name: string;
  color: string;
  label: string;
};

export type EventTypeConfig = {
  type: string;
  values: {
    name: string;
    color: string;
    label: string;
  }[];
};

export interface IEventDuration extends IEvent {
  /**
   * Duration in seconds
   */
  duration: number;
}

export interface EventSeries {
  type: 'custom';
  name: string;
  renderItem: echarts.CustomSeriesRenderItem;
  itemStyle: { opacity: number; color: string };
  encode: { x: number[]; y: number };
  data: { name: string; value: number[] }[];
}
