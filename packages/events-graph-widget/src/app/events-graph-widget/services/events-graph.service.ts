import { inject, Injectable } from '@angular/core';
import { EventService, type IEvent } from '@c8y/client';
import type { CustomSeriesRenderItem } from 'echarts';
import { groupBy } from 'lodash';
import {
  type EventBar,
  type EventConfig,
  type EventLane,
  type EventSegment,
  type EventSeries,
  type EventTypeConfig,
  type LaneState,
} from '../models/event-graph.model';

/** Events per request; the platform's maximum. */
const PAGE_SIZE = 2000;
/** Upper bound of requests per lane and refresh — beyond it the oldest events are dropped. */
const MAX_PAGES = 10;

@Injectable()
export class EventStatusTrackerService {
  private readonly eventService = inject(EventService);

  async fetchAndPrepareEvents(
    start: Date,
    now: Date,
    deviceId: string,
    type: EventTypeConfig,
    index: number,
    timeBoxStart: number,
    timeBoxEnd: number
  ): Promise<EventBar[]> {
    const events = await this.fetchEvents(start, now, deviceId, type.type);

    return this.toCustomFormat(
      index,
      this.toSegments(timeBoxStart, timeBoxEnd, events),
      // configs saved by older versions may lack `values`
      type.values ?? []
    );
  }

  /**
   * The events of the time box, oldest first, preceded by the last event before it — the
   * state the device was in when the time box starts, however long ago it changed.
   */
  async fetchEvents(
    startDate: Date,
    endDate: Date,
    deviceId: string,
    type: string
  ): Promise<IEvent[]> {
    const [before, inBox] = await Promise.all([
      this.eventService.list({
        dateTo: startDate.toISOString(),
        pageSize: 1,
        source: deviceId,
        type,
      }),
      this.fetchInBox(startDate, endDate, deviceId, type),
    ]);
    const previous = before.data[0];

    return previous ? [previous, ...inBox] : inBox;
  }

  /**
   * One bar per event, from its time (clamped to the time box) to the next event's time, the
   * last one to the end of the time box. Events whose bar would be empty — the same time as
   * the next one, or entirely outside the time box — produce none.
   */
  toSegments(timeBoxStart: number, timeBoxEnd: number, events: IEvent[]): EventSegment[] {
    const segments: EventSegment[] = [];

    events.forEach((event, index) => {
      const next = events[index + 1];
      const start = Math.max(Date.parse(event.time), timeBoxStart);
      const end = Math.min(next ? Date.parse(next.time) : timeBoxEnd, timeBoxEnd);

      if (end > start) {
        segments.push({ text: event.text, start, end });
      }
    });

    return segments;
  }

  toCustomFormat(
    categoryIndex: number,
    segments: EventSegment[],
    types: EventConfig[]
  ): EventBar[] {
    return segments.map(({ text, start, end }) => {
      const eventConfig = types.find((type) => type.name === text);

      return {
        name: eventConfig?.label ? eventConfig.label : text,
        value: [categoryIndex, start, end, end - start],
        itemStyle: {
          color: eventConfig?.color,
        },
      };
    });
  }

  toSeries(
    data: EventBar[],
    renderItem: CustomSeriesRenderItem,
    types: EventConfig[]
  ): EventSeries[] {
    const groups = groupBy(data, 'name');
    const names = Object.keys(groups);

    return names.map((name) => ({
      name,
      renderItem,
      type: 'custom' as const,
      itemStyle: {
        opacity: 0.9,
        color: types.find((type) => type.name === name || type.label === name)?.color,
      },
      encode: {
        x: [1, 2],
        y: 0,
      },
      data: groups[name],
    }));
  }

  /** The bars of one lane, from the output of {@link toCustomFormat}. */
  toLane(label: string, data: EventBar[]): EventLane {
    return {
      label,
      segments: data.map(({ name, value: [, start, end], itemStyle }) => ({
        name,
        start,
        end,
        color: itemStyle.color,
      })),
    };
  }

  /** What every lane shows at `time` — the readout of the shared time cursor. */
  statesAt(lanes: EventLane[], time: number): LaneState[] {
    return lanes.map(({ label, segments }) => {
      const segment = segments.find(({ start, end }) => start <= time && time < end);

      return { lane: label, state: segment?.name ?? null, color: segment?.color };
    });
  }

  /**
   * Newest first and page by page, so that a device with more events than {@link MAX_PAGES}
   * pages loses its oldest ones rather than its current state; returned oldest first.
   */
  private async fetchInBox(
    startDate: Date,
    endDate: Date,
    deviceId: string,
    type: string
  ): Promise<IEvent[]> {
    const events: IEvent[] = [];

    for (let currentPage = 1; currentPage <= MAX_PAGES; currentPage++) {
      const { data } = await this.eventService.list({
        dateFrom: startDate.toISOString(),
        dateTo: endDate.toISOString(),
        pageSize: PAGE_SIZE,
        currentPage,
        source: deviceId,
        type,
      });

      events.push(...data);

      if (data.length < PAGE_SIZE) {
        break;
      }
    }

    return events.reverse();
  }
}
