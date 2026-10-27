import { TestBed } from '@angular/core/testing';
import { EventService, type IEvent } from '@c8y/client';
import { provideMock } from '~helpers/auto-mock.helper';
import { EventStatusTrackerService } from './events-graph.service';

const T0 = Date.parse('2026-01-01T10:00:00.000Z');
const ev = (minutes: number, text: string): IEvent => ({
  id: `${minutes}`,
  type: 'state',
  text,
  time: new Date(T0 + minutes * 60_000).toISOString(),
  source: { id: '1' },
});

describe('EventStatusTrackerService', () => {
  let service: EventStatusTrackerService;
  let eventService: jasmine.SpyObj<EventService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [EventStatusTrackerService, provideMock(EventService)],
    });
    service = TestBed.inject(EventStatusTrackerService);
    eventService = TestBed.inject(EventService) as jasmine.SpyObj<EventService>;
  });

  describe('toSegments', () => {
    it('places each bar at its event time and ends it at the next event or the time box end', () => {
      const segments = service.toSegments(T0, T0 + 60 * 60_000, [
        ev(20, 'A'),
        ev(30, 'B'),
        ev(45, 'A'),
      ]);

      expect(segments).toEqual([
        { text: 'A', start: T0 + 20 * 60_000, end: T0 + 30 * 60_000 },
        { text: 'B', start: T0 + 30 * 60_000, end: T0 + 45 * 60_000 },
        { text: 'A', start: T0 + 45 * 60_000, end: T0 + 60 * 60_000 },
      ]);
    });

    it('clamps an event that started before the time box to its start', () => {
      const segments = service.toSegments(T0, T0 + 20 * 60_000, [ev(-300, 'A'), ev(5, 'B')]);

      expect(segments[0]).toEqual({ text: 'A', start: T0, end: T0 + 5 * 60_000 });
      expect(segments[1]).toEqual({ text: 'B', start: T0 + 5 * 60_000, end: T0 + 20 * 60_000 });
    });

    it('keeps millisecond precision', () => {
      const late = { ...ev(0, 'A'), time: new Date(T0 + 1_500).toISOString() };
      const [segment] = service.toSegments(T0, T0 + 4_250, [late]);

      expect(segment.end - segment.start).toBe(2_750);
    });

    it('drops bars without length — simultaneous events and events after the time box', () => {
      const segments = service.toSegments(T0, T0 + 10 * 60_000, [
        ev(5, 'A'),
        ev(5, 'B'),
        ev(15, 'C'),
      ]);

      expect(segments.map((s) => s.text)).toEqual(['B']);
    });
  });

  describe('toCustomFormat', () => {
    it('applies configured labels and colors and keeps the segment times', () => {
      const data = service.toCustomFormat(
        2,
        [
          { text: 'A', start: T0, end: T0 + 60_000 },
          { text: 'B', start: T0 + 90_000, end: T0 + 210_000 },
        ],
        [{ name: 'A', label: 'Alpha', color: '#ff0000' }]
      );

      expect(data[0]).toEqual({
        name: 'Alpha',
        value: [2, T0, T0 + 60_000, 60_000],
        itemStyle: { color: '#ff0000' },
      });
      expect(data[1].name).toBe('B');
      expect(data[1].value).toEqual([2, T0 + 90_000, T0 + 210_000, 120_000]);
    });
  });

  describe('toSeries', () => {
    it('groups data by name into custom series', () => {
      const renderItem = jasmine.createSpy('renderItem');
      const series = service.toSeries(
        [
          { name: 'Alpha', value: [0, 1, 2, 1], itemStyle: { color: '#f00' } },
          { name: 'B', value: [0, 2, 3, 1], itemStyle: {} },
          { name: 'Alpha', value: [0, 3, 4, 1], itemStyle: { color: '#f00' } },
        ],
        renderItem,
        [{ name: 'A', label: 'Alpha', color: '#f00' }]
      );

      expect(series.map((s) => s.name)).toEqual(['Alpha', 'B']);
      expect(series[0].data.length).toBe(2);
      expect(series[0].type).toBe('custom');
      expect(series[0].itemStyle.color).toBe('#f00');
      expect(series[1].itemStyle.color).toBeUndefined();
    });
  });

  describe('toLane', () => {
    it('keeps each bar with its start, end and color', () => {
      const lane = service.toLane('State · Pump 1', [
        { name: 'Running', value: [0, 10, 20, 10], itemStyle: { color: '#0a0' } },
        { name: 'B', value: [0, 20, 30, 10], itemStyle: { color: undefined } },
      ]);

      expect(lane).toEqual({
        label: 'State · Pump 1',
        segments: [
          { name: 'Running', start: 10, end: 20, color: '#0a0' },
          { name: 'B', start: 20, end: 30, color: undefined },
        ],
      });
    });
  });

  describe('statesAt', () => {
    const lanes = [
      {
        label: 'Machine',
        segments: [
          { name: 'Running', start: 0, end: 100, color: '#0a0' },
          { name: 'Stopped', start: 100, end: 200, color: '#a00' },
        ],
      },
      { label: 'Grid', segments: [{ name: 'Curtailed', start: 50, end: 150 }] },
    ];

    it('reports what every lane shows at the cursor time', () => {
      expect(service.statesAt(lanes, 120)).toEqual([
        { lane: 'Machine', state: 'Stopped', color: '#a00' },
        { lane: 'Grid', state: 'Curtailed', color: undefined },
      ]);
    });

    it('treats a bar as starting inclusive and ending exclusive', () => {
      expect(service.statesAt(lanes, 100)[0].state).toBe('Stopped');
    });

    it('reports null for a lane without a bar at that time', () => {
      expect(service.statesAt(lanes, 20)[1]).toEqual({
        lane: 'Grid',
        state: null,
        color: undefined,
      });
    });
  });

  describe('fetchEvents', () => {
    const page = (events: IEvent[]) => Promise.resolve({ data: events } as never);

    it('prepends the last event before the time box so the first state is known', async () => {
      eventService.list.and.callFake((filter: object) =>
        'dateFrom' in filter ? page([ev(30, 'C'), ev(10, 'B')]) : page([ev(-90, 'A')])
      );

      const events = await service.fetchEvents(
        new Date(T0),
        new Date(T0 + 3_600_000),
        '1',
        'state'
      );

      expect(events.map((e) => e.text)).toEqual(['A', 'B', 'C']);
      expect(eventService.list).toHaveBeenCalledWith(
        jasmine.objectContaining({ source: '1', type: 'state', pageSize: 2000, currentPage: 1 })
      );
      expect(eventService.list).toHaveBeenCalledWith({
        dateTo: new Date(T0).toISOString(),
        pageSize: 1,
        source: '1',
        type: 'state',
      });
    });

    it('still reports the earlier state when the time box has no events', async () => {
      eventService.list.and.callFake((filter: object) =>
        'dateFrom' in filter ? page([]) : page([ev(-300, 'Running')])
      );

      const events = await service.fetchEvents(new Date(T0), new Date(T0 + 1), '1', 'state');

      expect(events.map((e) => e.text)).toEqual(['Running']);
    });

    it('pages through the time box newest first until a page is not full', async () => {
      const full = Array.from({ length: 2000 }, (_, i) => ev(-i, `n${i}`));

      eventService.list.and.callFake((filter: { dateFrom?: string; currentPage?: number }) => {
        if (!filter.dateFrom) return page([]);

        return page(filter.currentPage === 1 ? full : [ev(-5000, 'oldest')]);
      });

      const events = await service.fetchEvents(new Date(T0), new Date(T0 + 1), '1', 'state');

      expect(events.length).toBe(2001);
      expect(events[0].text).toBe('oldest');
      expect(events[events.length - 1].text).toBe('n0');
    });
  });
});
