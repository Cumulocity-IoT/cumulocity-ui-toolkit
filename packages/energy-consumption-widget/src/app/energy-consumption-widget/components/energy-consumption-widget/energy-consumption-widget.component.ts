import { Component, inject, Input, OnInit } from '@angular/core';
import { IMeasurement, IMeasurementValue, MeasurementService } from '@c8y/client';
import { ChartConfiguration, ChartData } from 'chart.js';
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

@Component({
  selector: 'c8y-energy-consumption-widget',
  templateUrl: './energy-consumption-widget.component.html',
  styleUrl: './energy-consumption-widget.component.scss',
  standalone: false,
})
export class EnergyConsumptionWidgetComponent implements OnInit {
  private measurementService = inject(MeasurementService);

  @Input() config!: EnergyConsumptionWidgetConfig;

  readonly dateRangeSelect = ENERGY_CONSUMPTION_WIDGET__DATE_RANGE;

  barChartOptions!: ChartConfiguration<'bar'>['options'];
  barChartData?: ChartData<'bar'>;
  loading: boolean = true;
  dateRange!: string;

  private measurements: IMeasurement[] = [];
  private milestones?: string[];
  private unit?: string;

  ngOnInit(): void {
    this.dateRange = this.config.defaultRange;
    this.barChartOptions = this.setChartOptions();
    void this.fetchData();
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

  private roundValue(value: number, digits = this.config.digits): number {
    return Math.round(value * 10 ** digits) / 10 ** digits;
  }

  private calcValue(measurement: IMeasurement, index: number): number {
    const value = this.getValueFromMeasurement(measurement);

    return index > 0 && this.config.displayMode === EnergyWidgetDateDisplayMode.DELTA
      ? this.roundValue(value - this.getValueFromMeasurement(this.measurements[index - 1]))
      : this.roundValue(value);
  }

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
      milestones.reverse();
    }

    return milestones;
  }

  private getDurationFromRange(dateRange = this.dateRange): MomentManipulation {
    const range = dateRange.split(' ');

    return { amount: parseInt(range[0]), unit: range[1] };
  }

  private getBackgroundColorFallback(): string {
    return window.getComputedStyle(document.documentElement).getPropertyValue('--brand-light');
  }

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
    const options = cloneDeep(ENERGY_CONSUMPTION_WIDGET__DEFAULT_CHART_CONFIG);

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

    return options as ChartConfiguration<'bar'>['options'];
  }
}
