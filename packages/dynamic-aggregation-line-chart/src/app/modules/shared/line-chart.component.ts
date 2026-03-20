import { Component, DestroyRef, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { CoreModule } from '@c8y/ngx-components';
import { NGX_ECHARTS_CONFIG, NgxEchartsModule } from 'ngx-echarts';
import { ECharts } from 'echarts';
import { differenceInDays, differenceInHours, differenceInMinutes } from 'date-fns';
import { TranslateService } from '@ngx-translate/core';

export type DataItem = {
  name: string;
  value: [Date, number];
};

export type LineChartData = Record<string, DataItem[]>;

@Component({
  selector: 'ps-line-chart',
  template: `<div echarts [options]="options" [loading]="loading" (chartInit)="onChartInit($event)" (chartDataZoom)="onZoom($event)"></div>`,
  standalone: true,
  imports: [CoreModule, NgxEchartsModule],
  providers: [
    {
      provide: NGX_ECHARTS_CONFIG,
      useFactory: () => ({ echarts: () => import('echarts') }),
    },
  ],
})
export class EchartsLineChartComponent implements OnInit {
  instance?: ECharts;
  @Input() title = '';
  @Input() loading = false;
  @Output() zoomChange = new EventEmitter<{ dateFrom: Date; dateTo: Date }>();
  private readonly zoomSubject = new Subject<void>();
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateService = inject(TranslateService);
  private currentTimeRange?: { dateFrom: Date; dateTo: Date };
  private axisFormatter?: (val: number) => string;

  @Input() set timeRange(value: { dateFrom: Date; dateTo: Date }) {
    if (value) {
      this.updateXAxisFormatter(value);
    }
  }
  @Input() dateTo?: Date;

  @Input() set data(value: LineChartData) {
    if (!value) {
      return;
    }

    this._dataSeries = Object.entries(value).map(([name, data]) => ({
      name,
      type: 'line',
      showSymbol: false,
      data,
    }));

    this.applySeries();
  }

  @Input() set markLines(lines: { name: string; value: number; color: string }[]) {
    this._markLineSeries = lines?.length
      ? [
        {
          type: 'line',
          data: [],
          markLine: {
            silent: true,
            symbol: 'none',
            data: lines.map(l => ({
              yAxis: l.value,
              name: l.name,
              lineStyle: { color: l.color, type: 'dashed', width: 2 },
              label: { formatter: (p: any) => `${p.name}: ${Number(p.value).toFixed(2)}` },
            })),
          },
        },
      ]
      : [];
    this.applySeries();
  }

  private _dataSeries: any[] = [];
  private _markLineSeries: any[] = [];

  private applySeries(): void {
    const allSeries = [...this._dataSeries, ...this._markLineSeries];
    if (this.instance) {
      this.instance.setOption({ series: allSeries }, { replaceMerge: ['series'] });
    } else {
      this.options.series = allSeries;
    }
  }

  updateXAxisFormatter(value: { dateFrom: Date; dateTo: Date }) {
    this.currentTimeRange = value;
    const { dateTo, dateFrom } = value;
    const diffDays = differenceInDays(dateTo, dateFrom);
    const diffHours = differenceInHours(dateTo, dateFrom);
    const diffMinutes = differenceInMinutes(dateTo, dateFrom);

    const locale = this.translateService.currentLang || navigator.language || 'en';

    let intlOptions: Intl.DateTimeFormatOptions;
    if (diffDays > 365) {
      intlOptions = { year: 'numeric' };
    } else if (diffDays > 30) {
      intlOptions = { year: 'numeric', month: 'short' };
    } else if (diffDays > 7) {
      intlOptions = { month: 'short', day: 'numeric' };
    } else if (diffDays > 1) {
      // Weekly range: include weekday so labels are distinct across days.
      intlOptions = { weekday: 'short', month: 'short', day: 'numeric' };
    } else if (diffHours > 6) {
      intlOptions = { hour: '2-digit', minute: '2-digit' };
    } else {
      intlOptions = { hour: '2-digit', minute: '2-digit', second: '2-digit' };
    }

    const fmt = new Intl.DateTimeFormat(locale, intlOptions);
    this.axisFormatter = (val: number) => fmt.format(new Date(val));
    // Only call setOption for live updates (language/range changes after init).
    // The initial render uses the closure in options.xAxis.axisLabel.formatter.
    if (this.instance) {
      this.instance.setOption({ xAxis: { axisLabel: { formatter: this.axisFormatter } } });
    }
  }

  @Input() options = {
    title: {
      text: '',
      left: 'left',
      top: 5,
      textStyle: { fontSize: 12, color: '#888' },
    },
    tooltip: {
      trigger: 'axis',
      // formatter: function (params: any) {
      //   params = params[0];
      //   var date = new Date(params.name);
      //   return date.getDate() + '/' + (date.getMonth() + 1) + '/' + date.getFullYear() + ' : ' + params.value[1];
      // },
      axisPointer: {
        animation: false,
      },
    },
    legend: { type: 'scroll' },
    xAxis: {
      type: 'time',
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dotted',
          color: '#ccc',
          width: 1,
        },
      },
      axisLabel: {
        // Closure always delegates to the current locale-aware formatter.
        // Defined here so ECharts receives it during the initial render
        // and never triggers a coordinate-system-not-ready error.
        formatter: (val: number) => this.axisFormatter ? this.axisFormatter(val) : String(val),
      },
    },
    yAxis: {
      type: 'value',
      boundaryGap: [0, '100%'],
      splitLine: {
        show: true,
        lineStyle: {
          type: 'dotted',
          color: '#ccc',
          width: 1,
        },
      },
    },
    grid: {
      left: 0,
      right: 0,
      containLabel: true,
    },
    toolbox: {
      show: false,
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 20,
      },
      {
        start: 0,
        end: 20,
      },
    ],
    series: [
      {
        name: 'Min',
        type: 'line',
        showSymbol: false,
        data: new Array<DataItem>(),
      },
      {
        name: 'Average',
        type: 'line',
        showSymbol: false,
        data: new Array<DataItem>(),
      },
      {
        name: 'Max',
        type: 'line',
        showSymbol: false,
        data: new Array<DataItem>(),
      },
    ],
  };

  ngOnInit(): void {
    this.translateService.onLangChange.pipe(
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      if (this.currentTimeRange) {
        this.updateXAxisFormatter(this.currentTimeRange);
      }
    });

    this.zoomSubject.pipe(
      debounceTime(300),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(() => {
      if (!this.instance) return;
      const option = this.instance.getOption() as any;
      const dz = option?.dataZoom?.[0];
      const startValue: number | undefined = dz?.startValue;
      const endValue: number | undefined = dz?.endValue;
      if (startValue !== undefined && endValue !== undefined && startValue < endValue) {
        this.zoomChange.emit({ dateFrom: new Date(startValue), dateTo: new Date(endValue) });
      }
    });
  }

  onChartInit(ec: ECharts) {
    this.instance = ec;
  }

  onZoom(_event: any) {
    this.zoomSubject.next();
  }
}
