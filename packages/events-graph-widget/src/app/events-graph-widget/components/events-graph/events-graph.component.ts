import { AfterViewInit, Component, inject, Input, OnInit, ViewChild } from '@angular/core';
import { CoreModule, CountdownIntervalComponent, DatePipe } from '@c8y/ngx-components';
import { formatDistance, subHours } from 'date-fns';
import * as echarts from 'echarts';
import { EChartsOption } from 'echarts';
import { BarChart } from 'echarts/charts';
import { GridComponent } from 'echarts/components';
import * as echartsCore from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { has } from 'lodash';
import { ModalModule } from 'ngx-bootstrap/modal';
import { TooltipModule } from 'ngx-bootstrap/tooltip';
import { NgxEchartsDirective, provideEchartsCore } from 'ngx-echarts';
import { EventStatusTrackerConfig } from '../../models/event-graph.model';
import { EventStatusTrackerService, IEventDuration } from '../../services/events-graph.service';

echartsCore.use([BarChart, GridComponent, CanvasRenderer]);

@Component({
  selector: 'c8y-events-graph',
  templateUrl: './events-graph.component.html',
  styleUrl: './events-graph.component.css',
  imports: [CoreModule, ModalModule, TooltipModule, NgxEchartsDirective],
  standalone: true,
  providers: [provideEchartsCore({ echarts: echartsCore })],
})
export class EventGraphComponent implements OnInit, AfterViewInit {
  private eventStatusService = inject(EventStatusTrackerService);

  @ViewChild(CountdownIntervalComponent) countdownIntervalComponent: CountdownIntervalComponent;

  @Input() config: EventStatusTrackerConfig;

  events: IEventDuration[] = [];
  chartOptions: EChartsOption;
  series: {
    type: string;
    name: string;
    renderItem: any;
    itemStyle: { opacity: number; color: string };
    encode: { x: number[]; y: number };
    data: { name: string; value: number[] }[];
  }[];

  constructor(private date: DatePipe) {}

  ngOnInit(): void {
    void this.loadChartData();
  }

  ngAfterViewInit(): void {
    if (this.config.realtime) {
      this.countdownIntervalComponent.start();
    }
  }

  refresh(): void {
    void this.loadChartData();
    this.countdownIntervalComponent.reset();
  }

  onCountdownEnded(): void {
    this.refresh();
  }

  async loadChartData(): Promise<void> {
    const now = new Date();
    const start = subHours(now, this.config.hours || 4);
    const timeBoxStart = Date.parse(start.toISOString());
    const timeBoxEnd = Date.parse(now.toISOString());

    this.series = [];

    if (has(this.config, 'device')) {
      try {
        const categories: string[] = [];

        this.config.types.forEach((type) => {
          categories.push(type.type);
        });

        this.series = await this.prepareChartData(now, start, timeBoxStart, timeBoxEnd);

        this.chartOptions = {
          tooltip: {
            formatter: (item: echarts.DefaultLabelFormatterCallbackParams) => {
              const event = this.series[item.seriesIndex].data[item.dataIndex];
              const [, startDate, endDate, duration] = item.value as number[];

              return `<b>Text:</b> ${event.name}<br/><b>Start date:</b> ${this.date.transform(
                startDate
              )}<br/><b>End date:</b>${this.date.transform(
                endDate
              )}<br/><b>Duration:</b> ca. ${formatDistance(0, duration, {
                includeSeconds: true,
              })}`;
            },
          },
          dataZoom: [
            {
              type: 'slider',
              filterMode: 'weakFilter',
              showDataShadow: false,
              top: 250,
              labelFormatter: '',
            },
            {
              type: 'inside',
              filterMode: 'weakFilter',
            },
          ],
          legend: {
            top: 10,
          },
          grid: {
            left: '3%',
            containLabel: true,
            height: 150,
          },
          xAxis: {
            min: timeBoxStart,
            scale: true,
            axisLabel: {
              formatter: (val: number) => this.date.transform(val, 'HH:mm'),
            },
          },
          yAxis: {
            data: categories,
          },
          series: <any>this.series,
        };
      } catch (e) {
        console.error(e);
      }
    }
  }

  async prepareChartData(now: Date, start: Date, timeBoxStart: number, timeBoxEnd: number) {
    const series = [];

    for (const [index, type] of this.config.types.entries()) {
      const custom = await this.eventStatusService.fetchAndPrepareEvents(
        start,
        now,
        this.config.device.id,
        type,
        index,
        timeBoxStart,
        timeBoxEnd
      );

      series.push(...this.eventStatusService.toSeries(custom, this.renderItem, type.values));
    }

    return series;
  }

  renderItem = (
    params: echarts.CustomSeriesRenderItemParams,
    api: echarts.CustomSeriesRenderItemAPI
  ) => {
    const categoryIndex = api.value(0);
    const start = api.coord([api.value(1), categoryIndex]);
    const end = api.coord([api.value(2), categoryIndex]);
    const height = api.size([0, 1])[1] * 0.2;
    const rectShape = echarts.graphic.clipRectByRect(
      {
        x: start[0],
        y: start[1] - height / 2,
        width: end[0] - start[0],
        height: height,
      },
      {
        x: (<any>params.coordSys).x,
        y: (<any>params.coordSys).y,
        width: (<any>params.coordSys).width,
        height: (<any>params.coordSys).height,
      }
    );

    return (
      rectShape && {
        type: 'rect',
        transition: ['shape'],
        shape: rectShape,
        style: api.style(),
      }
    );
  };
}
