import {
  type AfterViewInit,
  Component,
  inject,
  Input,
  type OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { CoreModule, CountdownIntervalComponent, DatePipe } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { TranslateService } from '@ngx-translate/core';
import { formatDistance, subHours } from 'date-fns';
import type {
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
  CustomSeriesRenderItemReturn,
  ECharts,
  EChartsOption,
  TooltipComponentFormatterCallbackParams,
} from 'echarts';
import { CustomChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echartsCore from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import {
  DEFAULT_GRAPH_ITEM_SCALE,
  type EventLane,
  type EventSeries,
  type EventStatusTrackerConfig,
  type EventTypeConfig,
  type LaneState,
} from '../../models/event-graph.model';
import { EventStatusTrackerService } from '../../services/events-graph.service';

echartsCore.use([
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export type EventGraphState = 'loading' | 'no-device' | 'no-types' | 'error' | 'ready';

@Component({
  selector: 'c8y-events-graph',
  templateUrl: './events-graph.component.html',
  styleUrl: './events-graph.component.less',
  imports: [CoreModule, NgxEchartsDirective],
  providers: [provideEchartsCore({ echarts: echartsCore }), DatePipe],
})
export class EventGraphComponent implements OnInit, AfterViewInit {
  private readonly eventStatusService = inject(EventStatusTrackerService);
  private readonly date = inject(DatePipe);
  private readonly translate = inject(TranslateService);

  @ViewChild(CountdownIntervalComponent) countdownIntervalComponent?: CountdownIntervalComponent;

  @Input() config!: EventStatusTrackerConfig;

  chartOptions: EChartsOption = {};
  series: EventSeries[] = [];
  state: EventGraphState = 'loading';
  /** Time and per-lane states under the cursor; set from chart events, hence a signal. */
  readonly cursor = signal<{ time: string; states: LaneState[] } | null>(null);

  /** False while the user has paused auto refresh with the countdown toggle. */
  autoRefresh = true;

  private lanes: EventLane[] = [];
  /** Bumped per load: a slower, older load must not overwrite the result of a newer one. */
  private loadGeneration = 0;

  ngOnInit(): void {
    void this.loadChartData();
  }

  ngAfterViewInit(): void {
    if (this.config?.realtime) {
      this.countdownIntervalComponent?.start();
    }
  }

  refresh(): void {
    void this.loadChartData();

    if (this.autoRefresh) {
      this.countdownIntervalComponent?.reset();
    }
  }

  setAutoRefresh(enabled: boolean): void {
    this.autoRefresh = enabled;

    if (enabled) {
      this.countdownIntervalComponent?.start();
    } else {
      this.countdownIntervalComponent?.stop();
    }
  }

  onCountdownEnded(): void {
    this.refresh();
  }

  async loadChartData(): Promise<void> {
    if (!this.config?.device?.id) {
      this.state = 'no-device';

      return;
    }

    const types = (this.config.types ?? []).filter((type) => !!type?.type);

    if (!types.length) {
      this.state = 'no-types';

      return;
    }

    const now = new Date();
    const start = subHours(now, this.config.hours || 4);
    const timeBoxStart = start.getTime();
    const timeBoxEnd = now.getTime();
    const generation = ++this.loadGeneration;

    try {
      const { series, lanes } = await this.prepareChartData(
        types,
        now,
        start,
        timeBoxStart,
        timeBoxEnd
      );

      if (generation !== this.loadGeneration) {
        return;
      }
      this.series = series;
      this.lanes = lanes;
      this.cursor.set(null);

      this.chartOptions = {
        tooltip: {
          formatter: this.formatTooltip,
        },
        dataZoom: [
          {
            type: 'slider',
            filterMode: 'weakFilter',
            showDataShadow: false,
            labelFormatter: '',
          },
          {
            type: 'inside',
            filterMode: 'weakFilter',
          },
        ],
        legend: {
          top: 8,
        },
        grid: {
          left: '3%',
          right: 32,
          containLabel: true,
        },
        xAxis: {
          type: 'time',
          min: timeBoxStart,
          max: timeBoxEnd,
          axisLabel: {
            formatter: this.formatAxisLabel,
          },
          // shared time cursor across all lanes; its readout is rendered above the chart
          axisPointer: {
            show: true,
            type: 'line',
            snap: false,
            triggerTooltip: false,
            label: { formatter: ({ value }) => this.formatCursorTime(value as number) },
          },
        },
        yAxis: {
          data: types.map((type) => this.laneLabel(type)),
          // first configured lane on top, in the same order as the cursor readout
          inverse: true,
        },
        series: this.series,
      };
      this.state = 'ready';
    } catch {
      if (generation === this.loadGeneration) {
        this.state = 'error';
      }
    }
  }

  async prepareChartData(
    types: EventStatusTrackerConfig['types'],
    now: Date,
    start: Date,
    timeBoxStart: number,
    timeBoxEnd: number
  ): Promise<{ series: EventSeries[]; lanes: EventLane[] }> {
    const bars = await Promise.all(
      types.map((type, index) =>
        this.eventStatusService.fetchAndPrepareEvents(
          start,
          now,
          type.device?.id ?? this.config.device.id,
          type,
          index,
          timeBoxStart,
          timeBoxEnd
        )
      )
    );

    return {
      series: types.flatMap((type, index) =>
        this.eventStatusService.toSeries(bars[index], this.renderItem, type.values ?? [])
      ),
      lanes: types.map((type, index) =>
        this.eventStatusService.toLane(this.laneLabel(type), bars[index])
      ),
    };
  }

  onChartInit(chart: ECharts): void {
    chart.on('updateAxisPointer', (event) => {
      const time = (event as { axesInfo?: { value: number }[] }).axesInfo?.[0]?.value;

      this.cursor.set(
        time === undefined
          ? null
          : {
              time: this.formatCursorTime(time),
              states: this.eventStatusService.statesAt(this.lanes, time),
            }
      );
    });
    chart.getZr().on('globalout', () => this.cursor.set(null));
  }

  renderItem = (
    params: CustomSeriesRenderItemParams,
    api: CustomSeriesRenderItemAPI
  ): CustomSeriesRenderItemReturn => {
    const coordSys = params.coordSys as unknown as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    const categoryIndex = api.value(0) as number;
    const start = api.coord([api.value(1), categoryIndex]);
    const end = api.coord([api.value(2), categoryIndex]);
    const scale = this.config.scale || DEFAULT_GRAPH_ITEM_SCALE;
    const height = (api.size!([0, 1]) as number[])[1] * scale;
    const rectShape = echartsCore.graphic.clipRectByRect(
      {
        x: start[0],
        y: start[1] - height / 2,
        width: end[0] - start[0],
        height: height,
      },
      coordSys
    );

    return rectShape
      ? {
          type: 'rect',
          transition: ['shape'],
          shape: rectShape,
          style: api.style(),
        }
      : null;
  };

  /** The event type, plus the device when the lane has its own (group dashboards). */
  private laneLabel(type: EventTypeConfig): string {
    return type.device ? `${type.type} · ${type.device.name}` : type.type;
  }

  private formatTooltip = (params: TooltipComponentFormatterCallbackParams): string => {
    const item = params as TooltipComponentFormatterCallbackParams & {
      seriesIndex: number;
      dataIndex: number;
      value: [number, number, number, number];
    };
    const event = this.series[item.seriesIndex]?.data[item.dataIndex];
    const [, startDate, endDate, duration] = item.value;
    const t = (key: string) => this.translate.instant(key) as string;

    // ECharts renders the formatter's result as HTML; the name is device-supplied event text
    return (
      `<b>${t(gettext('Text'))}:</b> ${escapeHtml(event?.name || 'N/A')}<br/>` +
      `<b>${t(gettext('Start date'))}:</b> ${this.date.transform(startDate)}<br/>` +
      `<b>${t(gettext('End date'))}:</b> ${this.date.transform(endDate)}<br/>` +
      `<b>${t(gettext('Duration'))}:</b> ca. ${formatDistance(0, duration, {
        includeSeconds: true,
      })}`
    );
  };

  private formatCursorTime(time: number): string {
    return (this.date.transform(time, 'HH:mm:ss') as string) ?? '';
  }

  private formatAxisLabel = (val: number): string => {
    const transformed = this.date.transform(val, 'HH:mm') as string;
    return transformed ? transformed : '';
  };
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
