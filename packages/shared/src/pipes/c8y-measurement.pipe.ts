import { inject, Pipe, PipeTransform } from '@angular/core';
import { IMeasurement } from '@c8y/client';
import { get } from 'lodash';
import { NumberPipe } from '@c8y/ngx-components';
import { detectMeasurementPaths } from '../helpers/measurement-paths';

@Pipe({
  name: 'c8yMeasurement',
  standalone: true,
})
export class C8yMeasurementPipe implements PipeTransform {
  private number = inject(NumberPipe);

  transform(measurement: IMeasurement, round?: 'ceil' | 'floor', digitsInfo?: string): string {
    if (!measurement) {
      return '-';
    }
    const paths = detectMeasurementPaths(measurement);
    const l = paths.length;

    if (l === 0) {
      return '-';
    } else if (l === 1) {
      const m = get(measurement, paths[0]) as { value: number | string; unit?: string };
      let { value } = m;
      const unit = m.unit;

      if (!isNaN(+value)) {
        value = this.number.transform(value, round ?? 'ceil', digitsInfo ?? '1.1-2') ?? value;
      }

      return unit?.length ? `${value} ${unit}` : `${value}`;
    } else {
      return `Found multiple measurements (${l}).`;
    }
  }
}
