import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  inject,
  Input,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IMeasurement, IMeasurementValue, MeasurementService } from '@c8y/client';
import { CoreModule } from '@c8y/ngx-components';
import { Chart, ChartConfiguration, ChartData, registerables } from 'chart.js';
import { cloneDeep, sortBy } from 'lodash';
import moment from 'moment';
import {
  ENERGY_CONSUMPTION_WIDGET__DATE_RANGE,
  ENERGY_CONSUMPTION_WIDGET__DEFAULT_CHART_CONFIG,
} from '../../models/energy-consumption-widget.const';
import {
  EnergyConsumptionWidgetConfig,
  EnergyWidgetDateDisplayMode,
} from '../../models/energy-consumption-widget.model';

interface MomentManipulation {
  amount: number;
  unit: string;
}

interface RawChartData {
  label: string;
  value: number;
}

interface StrippedResultPaging {
  filter: {
    dateTo: string;
  };
}

interface MeasurementSeries {
  [series: string]: IMeasurementValue;
}

let chartJsRegistered = false;

@Component({
  selector: 'c8y-energy-consumption-widget',
  templateUrl: './energy-consumption-widget.component.html',
  styleUrl: './energy-consumption-widget.component.scss',
  standalone: true,
  imports: [CommonModule, FormsModule, CoreModule],
})
export class EnergyConsumptionWidgetComponent implements OnInit, AfterViewInit, OnDestroy {
  private measurementService = inject(MeasurementService);

  @Input() config!: EnergyConsumptionWidgetConfig;

  readonly dateRangeSelect = ENERGY_CONSUMPTION_WIDGET__DATE_RANGE;

  barChartOptions!: ChartConfiguration<'bar'>['options'];
  barChartData?: ChartData<'bar'>;
  loading: boolean = true;
  dateRange!: string;

  @ViewChild('barCanvas')
  private barCanvas?: ElementRef<HTMLCanvasElement>;

  private measurements: IMeasurement[] = [];
  private milestones?: string[];
  private unit?: string;
  private barChart?: Chart<'bar'>;

  ngOnInit(): void {
    if (!chartJsRegistered) {
      Chart.register(...registerables);
      chartJsRegistered = true;
    }

    this.dateRange = this.config.defaultRange;
    this.barChartOptions = this.setChartOptions();
    void this.fetchData();
  }

  ngAfterViewInit(): void {
    this.renderChart();
  }

  ngOnDestroy(): void {
    this.barChart?.destroy();
  }

  reload(): void {
    void this.fetchData();
  }

  private async fetchData(dateRange = this.dateRange): Promise<void> {
    this.loading = true;
    this.milestones = this.generateMilestones(dateRange);
    // TODO fetch data point - needed?
    // TODO if events: fetch events
    this.measurements = await this.loadMeasurements();
    this.barChartData = this.setChartConfig(this.digestMeasurements());
    this.loading = false;
    setTimeout(() => this.renderChart());
  }

  private renderChart(): void {
    const canvas = this.barCanvas?.nativeElement;

    if (!canvas || !this.barChartData || !this.barChartOptions || this.loading) {
      return;
    }

    this.barChart?.destroy();
    this.barChart = new Chart(canvas, {
      type: 'bar',
      data: this.barChartData,
      options: this.barChartOptions,
    });
  }

  // add date param
  private async loadMeasurements(milestones = this.milestones): Promise<IMeasurement[]> {
    const promises: Promise<IMeasurement>[] = [];

    milestones?.forEach((milestone) => {
      promises.push(this.loadSingleMeasurement(milestone));
    });

    const measurements = await Promise.all(promises);

    // Remove empty and sort by date
    return sortBy(
      measurements.filter((m) => m !== undefined),
      (m) => new Date(m.milestone as string)
    );
  }

  private async loadSingleMeasurement(date: string): Promise<IMeasurement> {
    const response = await this.measurementService.list({
      source: this.config.device.id,
      pageSize: 1,
      type: this.config.type,
      withTotalPages: false,
      dateFrom: new Date(0).toISOString(),
      dateTo: date,
      revert: true,
    });

    const measurement = response.data[0];

    if (measurement) {
      measurement.milestone = (response.paging as unknown as StrippedResultPaging).filter?.dateTo;
    }

    return measurement;
  }

  /**
   * Converts raw IMeasurements into labelled chart data points.
   * The first measurement is skipped in DELTA mode because it has no predecessor;
   * the `unit` field is extracted from each measurement and cached for the axis label.
   */
  private digestMeasurements(measurements = this.measurements): RawChartData[] {
    const rawData: RawChartData[] = [];

    measurements.forEach((measurement, index) => {
      if (index > 0) {
        rawData.push({
          label: this.generateLabel(measurement),
          value: this.calcValue(measurement, index),
        });
      }

      this.unit = this.getUnitFromMeasurement(measurement) || this.unit;
    });

    return rawData;
  }

  private setChartConfig(rawChartData: RawChartData[]): ChartData<'bar'> {
    const backgroundColor = this.config.barColor || this.getBackgroundColorFallback();
    const labels: string[] = [];
    const data: number[] = [];

    rawChartData.forEach((d) => {
      labels.push(d.label);
      data.push(d.value);
    });

    return {
      labels,
      datasets: [{ data, backgroundColor }],
    };
  }

  private getValueFromMeasurement(measurement: IMeasurement): number {
    return this.getMeasurementValue(measurement)?.value;
  }

  private getUnitFromMeasurement(measurement: IMeasurement): string | undefined {
    return this.getMeasurementValue(measurement)?.unit;
  }

  private getMeasurementValue(measurement: IMeasurement): IMeasurementValue {
    const series = measurement[this.config.fragment] as MeasurementSeries;

    return this.config.series ? series[this.config.series] : (series as IMeasurementValue);
  }

  /**
   * Rounds `value` to `digits` decimal places using symmetric rounding.
   * `digits` defaults to `config.digits`.
   */
  private roundValue(value: number, digits = this.config.digits): number {
    return Math.round(value * 10 ** digits) / 10 ** digits;
  }

  /**
   * Returns the chart value for one bar.
   * - In {@link EnergyWidgetDateDisplayMode.DELTA} mode (and `index > 0`) the value is
   *   the difference to the previous measurement, rounded to `config.digits`.
   * - Otherwise the raw cumulative reading is used.
   */
  private calcValue(measurement: IMeasurement, index: number): number {
    const value = this.getValueFromMeasurement(measurement);

    return index > 0 && this.config.displayMode === EnergyWidgetDateDisplayMode.DELTA
      ? this.roundValue(value - this.getValueFromMeasurement(this.measurements[index - 1]))
      : this.roundValue(value);
  }

  /**
   * Generates `range.amount + 1` ISO-string timestamps — one for "now" plus one
   * boundary date per bar.  Dates are snapped to the start of their period
   * (midnight for days/weeks/months, top of the hour for hours).
   *
   * @param dateRange - A space-separated string such as `"7 days"` or `"12 months"`.
   * @param startOfWeek - Day-of-week index for the first day (1 = Monday, default).
   */
  private generateMilestones(dateRange = this.dateRange, startOfWeek = 1): string[] {
    // TODO make start of week configurable
    const range = this.getDurationFromRange(dateRange);

    const milestones: string[] = [new Date().toISOString()];

    for (let i = 0; i < range.amount; i++) {
      const d = new Date();

      switch (range.unit) {
        case 'minutes':
        case 'hours':
          d.setHours(d.getHours() - i, 1);
          d.setMinutes(0, 0, 0); // normalize time
          break;
        case 'months':
          d.setMonth(d.getMonth() - i, 1); // set to the 1st of the month
          d.setHours(0, 0, 0, 0); // normalize
          break;
        case 'weeks':
          d.setDate(d.getDate() - i * 7 - d.getDay() + startOfWeek);
          d.setHours(0, 0, 0, 0);
          break;
        case 'days':
          d.setDate(d.getDate() - i);
          d.setHours(0, 0, 0, 0);
          break;
      }

      milestones.push(d.toISOString());
    }

    milestones.reverse();

    return milestones;
  }

  /**
   * Parses a range string such as `"7 days"` or `"12 months"` into an
   * `{ amount, unit }` tuple consumed by {@link generateMilestones} and
   * {@link generateLabel}.
   */
  private getDurationFromRange(dateRange = this.dateRange): MomentManipulation {
    const range = dateRange.split(' ');

    return { amount: parseInt(range[0]), unit: range[1] };
  }

  private getBackgroundColorFallback(): string {
    return window.getComputedStyle(document.documentElement).getPropertyValue('--brand-light');
  }

  /**
   * Derives a human-readable axis label for one bar from its milestone timestamp
   * and the current date range unit:
   * - `months`  → `"Jan 24"`
   * - `weeks`   → `"01. - 07. Jan"`
   * - `hours`   → `"14:00"`
   * - `days`    → `"01. Jan"`
   *
   * Note: the milestone stored on each measurement is the *end* of the period,
   * so the label subtracts one unit to represent the correct period.
   */
  private generateLabel(
    measurement: IMeasurement,
    dateRange = this.dateRange,
    startOfWeek = 1
  ): string {
    const { unit } = this.getDurationFromRange(dateRange);
    const date = moment(measurement.milestone as string);
    let start: moment.Moment;
    let end: moment.Moment;

    switch (unit) {
      case 'months':
        if (date.get('h') === 0) date.subtract(1, 'month');

        return date.format('MMM YY');

      case 'weeks':
        if (date.get('day') === startOfWeek) {
          start = date.clone().subtract(7, 'days');
          end = date.subtract(1, 'day');
        } else {
          start = date.clone().subtract(date.get('day') - 1, 'days');
          end = date;
        }

        return `${start.format('DD.')} - ${end.format('DD. MMM')}`;

      case 'hours':
        if (date.get('m') === 0) date.subtract(1, 'hour');

        return date.format('HH:mm');

      case 'days':
      default:
        if (date.get('h') === 0) date.subtract(1, 'day');

        return date.format('DD. MMM');
    }
  }

  private setChartOptions(): ChartConfiguration<'bar'>['options'] {
    const options = cloneDeep(
      ENERGY_CONSUMPTION_WIDGET__DEFAULT_CHART_CONFIG
    ) as ChartConfiguration<'bar'>['options'];

    const tooltip = {
      tooltip: {
        callbacks: {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          label: (context) => `${context.formattedValue} ${this.unit}`,
        },
      },
    };

    options.plugins = {
      ...options.plugins,
      ...tooltip,
    };

    options.scales.y = {
      beginAtZero: this.config.beginAtZero || false,
    };
    options.responsive = true;
    options.maintainAspectRatio = false;

    return options;
  }
}
