import { TestBed } from '@angular/core/testing';
import { EventService, IEvent } from '@c8y/client';
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

  describe('convert', () => {
    it('derives each duration from the next event and the last one from the time box end', () => {
      const result = service.convert(T0, T0 + 60 * 60_000, [ev(0, 'A'), ev(10, 'B'), ev(30, 'A')]);

      expect(result.map((e) => e.duration)).toEqual([600, 1200, 1800]);
    });

    it('clamps events that started before the time box to its start', () => {
      const result = service.convert(T0, T0 + 20 * 60_000, [ev(-30, 'A'), ev(5, 'B')]);

      expect(result[0].duration).toBe(300);
      expect(result[1].duration).toBe(900);
    });

    it('sets a null duration when the next event is not later', () => {
      const result = service.convert(T0, T0 + 60_000, [ev(5, 'A'), ev(5, 'B')]);

      expect(result[0].duration).toBeNull();
    });
  });

  describe('toCustomFormat', () => {
    it('chains bars and applies configured labels and colors', () => {
      const data = service.toCustomFormat(
        2,
        T0,
        [
          { ...ev(0, 'A'), duration: 60 },
          { ...ev(1, 'B'), duration: 120 },
        ],
        [{ name: 'A', label: 'Alpha', color: '#ff0000' }]
      );

      expect(data[0]).toEqual({
        name: 'Alpha',
        value: [2, T0, T0 + 60_000, 60_000],
        itemStyle: { color: '#ff0000' },
      });
      expect(data[1].name).toBe('B');
      expect(data[1].value).toEqual([2, T0 + 60_000, T0 + 180_000, 120_000]);
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

  describe('fetchEvents', () => {
    it('prepends the last event before the time box so the first state is known', async () => {
      const inBox = [ev(10, 'B')];
      const before = [ev(-90, 'A')];

      eventService.list.and.returnValues(
        Promise.resolve({ data: inBox } as never),
        Promise.resolve({ data: before } as never)
      );

      const events = await service.fetchEvents(
        new Date(T0),
        new Date(T0 + 3_600_000),
        '1',
        'state'
      );

      expect(events.map((e) => e.text)).toEqual(['A', 'B']);
      expect(eventService.list.calls.first().args[0]).toEqual(
        jasmine.objectContaining({ source: '1', type: 'state', revert: true, pageSize: 2000 })
      );
      expect(eventService.list.calls.mostRecent().args[0]).toEqual(
        jasmine.objectContaining({ pageSize: 1, dateTo: ev(10, 'B').time })
      );
    });

    it('does not query earlier events when the time box is empty', async () => {
      eventService.list.and.returnValue(Promise.resolve({ data: [] } as never));

      const events = await service.fetchEvents(new Date(T0), new Date(T0 + 1), '1', 'state');

      expect(events).toEqual([]);
      expect(eventService.list).toHaveBeenCalledTimes(1);
    });
  });
});
