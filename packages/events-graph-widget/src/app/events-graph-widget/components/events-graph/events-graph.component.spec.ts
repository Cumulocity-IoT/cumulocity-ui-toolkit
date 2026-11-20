import { TestBed } from '@angular/core/testing';
import { EventService } from '@c8y/client';
import { DatePipe } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import type { EventBar, EventStatusTrackerConfig } from '../../models/event-graph.model';
import { EventStatusTrackerService } from '../../services/events-graph.service';
import { EventGraphComponent } from './events-graph.component';

const CONFIG = {
  hours: 4,
  realtime: true,
  realtimeInterval: 30_000,
  device: { id: '1', name: 'Pump' },
  types: [{ type: 'state', values: [] }],
  scale: 0.2,
} as unknown as EventStatusTrackerConfig;

const bar = (name: string): EventBar => ({
  name,
  value: [0, 1_000, 2_000, 1_000],
  itemStyle: {},
});

interface Internals {
  formatTooltip(params: unknown): string;
}

describe('EventGraphComponent', () => {
  let fetchAndPrepareEvents: jasmine.Spy;
  let component: EventGraphComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [EventGraphComponent],
      providers: [EventStatusTrackerService, { provide: EventService, useValue: {} }],
    }).overrideComponent(EventGraphComponent, {
      set: {
        imports: [],
        template: '',
        providers: [
          { provide: DatePipe, useValue: { transform: (value: unknown) => String(value) } },
          { provide: TranslateService, useValue: { instant: (key: string) => key } },
        ],
      },
    });
    fetchAndPrepareEvents = spyOn(
      TestBed.inject(EventStatusTrackerService),
      'fetchAndPrepareEvents'
    ).and.resolveTo([]);
    component = TestBed.createComponent(EventGraphComponent).componentInstance;
    component.config = CONFIG;
  });

  it('escapes event texts in the tooltip — they come from devices', async () => {
    fetchAndPrepareEvents.and.resolveTo([bar('<img src=x onerror=alert(1)>')]);
    await component.loadChartData();

    const html = (component as unknown as Internals).formatTooltip({
      seriesIndex: 0,
      dataIndex: 0,
      value: [0, 1_000, 2_000, 1_000],
    });

    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('keeps the result of the newest load when an older one answers last', async () => {
    const answers: ((bars: EventBar[]) => void)[] = [];

    fetchAndPrepareEvents.and.callFake(
      () => new Promise<EventBar[]>((resolve) => answers.push(resolve))
    );

    const older = component.loadChartData();
    const newer = component.loadChartData();

    answers[1]([bar('new')]);
    await newer;
    answers[0]([bar('old')]);
    await older;

    expect(component.series.map((series) => series.name)).toEqual(['new']);
  });

  it('draws a time axis from the start to the end of the time box', async () => {
    await component.loadChartData();

    const xAxis = component.chartOptions.xAxis as { type: string; min: number; max: number };

    expect(xAxis.type).toBe('time');
    expect(xAxis.max - xAxis.min).toBe(4 * 3_600_000);
  });

  it('pauses auto refresh with the toggle, and a manual refresh does not restart it', () => {
    const countdown = jasmine.createSpyObj('countdown', ['start', 'stop', 'reset']);

    component.countdownIntervalComponent = countdown;
    component.setAutoRefresh(false);
    component.refresh();

    expect(countdown.stop).toHaveBeenCalled();
    expect(countdown.reset).not.toHaveBeenCalled();

    component.setAutoRefresh(true);
    expect(countdown.start).toHaveBeenCalled();
  });
});
