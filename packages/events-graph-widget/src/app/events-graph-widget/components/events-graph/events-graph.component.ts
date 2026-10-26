import { AfterViewInit, Component, inject, Input, OnInit, ViewChild } from '@angular/core';
import { CoreModule, CountdownIntervalComponent, DatePipe } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { TranslateService } from '@ngx-translate/core';
import { formatDistance, subHours } from 'date-fns';
import type {
  CustomSeriesRenderItemAPI,
  CustomSeriesRenderItemParams,
  CustomSeriesRenderItemReturn,
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
  EventSeries,
  EventStatusTrackerConfig,
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

  @ViewChild(CountdownIntervalComponent) countdownIntervalComponent: CountdownIntervalComponent;

  @Input() config: EventStatusTrackerConfig;

  chartOptions: EChartsOption;
  series: EventSeries[] = [];
  state: EventGraphState = 'loading';

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
    this.countdownIntervalComponent?.reset();
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

    try {
      this.series = await this.prepareChartData(types, now, start, timeBoxStart, timeBoxEnd);

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
          min: timeBoxStart,
          scale: true,
          axisLabel: {
            formatter: this.formatAxisLabel,
          },
        },
        yAxis: {
          data: types.map((type) => type.type),
        },
        series: this.series,
      };
      this.state = 'ready';
    } catch {
      this.state = 'error';
    }
  }

  async prepareChartData(
    types: EventStatusTrackerConfig['types'],
    now: Date,
    start: Date,
    timeBoxStart: number,
    timeBoxEnd: number
  ): Promise<EventSeries[]> {
    const series: EventSeries[] = [];

    for (const [index, type] of types.entries()) {
      const custom = await this.eventStatusService.fetchAndPrepareEvents(
        start,
        now,
        this.config.device.id,
        type,
        index,
        timeBoxStart,
        timeBoxEnd
      );

      series.push(...this.eventStatusService.toSeries(custom, this.renderItem, type.values ?? []));
    }

    return series;
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

  private formatTooltip = (params: TooltipComponentFormatterCallbackParams): string => {
    const item = params as TooltipComponentFormatterCallbackParams & {
      seriesIndex: number;
      dataIndex: number;
      value: [number, number, number, number];
    };
    const event = this.series[item.seriesIndex]?.data[item.dataIndex];
    const [, startDate, endDate, duration] = item.value;
    const t = (key: string) => this.translate.instant(key) as string;

    return (
      `<b>${t(gettext('Text'))}:</b> ${event?.name || 'N/A'}<br/>` +
      `<b>${t(gettext('Start date'))}:</b> ${this.date.transform(startDate)}<br/>` +
      `<b>${t(gettext('End date'))}:</b> ${this.date.transform(endDate)}<br/>` +
      `<b>${t(gettext('Duration'))}:</b> ca. ${formatDistance(0, duration, {
        includeSeconds: true,
      })}`
    );
  };

  private formatAxisLabel = (val: number): string => {
    const transformed = this.date.transform(val, 'HH:mm') as string;
    return transformed ? transformed : '';
  };
}
