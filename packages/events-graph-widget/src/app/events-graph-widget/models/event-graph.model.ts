import { type IEvent } from '@c8y/client';
import type { CustomSeriesRenderItem } from 'echarts';

export type EventStatusTrackerConfig = {
  hours: number;
  realtime: boolean;
  realtimeInterval: number;
  device: {
    id: string;
    name: string;
  };
  types: EventTypeConfig[];
  scale: number;
};

export type EventConfig = {
  name: string;
  color: string;
  label: string;
};

export type EventTypeConfig = {
  type: string;
  /**
   * Source of this lane's events. Only offered on group dashboards (a device of that group);
   * without it the lane uses the widget's target.
   */
  device?: {
    id: string;
    name: string;
  };
  values: EventConfig[];
};

/** One row of the chart: its label and the state bars drawn in it. */
export interface EventLane {
  label: string;
  segments: { name: string; start: number; end: number; color?: string }[];
}

/** A lane's state at the time cursor; `state` is null when the lane has no bar there. */
export interface LaneState {
  lane: string;
  state: string | null;
  color?: string;
}

/** The time an event's state lasts on the chart; times in ms. */
export interface EventSegment {
  text: IEvent['text'];
  start: number;
  end: number;
}

/** One bar of the chart: `value` is `[lane index, start, end, duration]`, times in ms. */
export interface EventBar {
  name: string;
  value: [number, number, number, number];
  itemStyle: { color?: string };
}

export interface EventSeries {
  type: 'custom';
  name: string;
  renderItem: CustomSeriesRenderItem;
  itemStyle: { opacity: number; color?: string };
  encode: { x: number[]; y: number };
  data: { name: string; value: number[]; itemStyle?: { color?: string } }[];
}

export const DEFAULT_GRAPH_ITEM_SCALE = 0.2;
export const DEFAULT_GRAPH_INTERVAL = 30000;
