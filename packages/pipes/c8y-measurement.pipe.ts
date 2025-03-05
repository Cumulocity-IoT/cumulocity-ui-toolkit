import { Pipe, PipeTransform } from '@angular/core';
import { IMeasurement } from '@c8y/client';
import { get, has } from 'lodash';
import { NumberPipe } from '@c8y/ngx-components';

@Pipe({
  name: 'c8yMeasurement',
})
export class C8yMeasurementPipe implements PipeTransform {
  constructor(private number: NumberPipe) {}

  transform(measurement: IMeasurement, round?: 'ceil' | 'floor', digitsInfo?: string): string {
    if (!measurement) {
      return '-';
    }
    const paths = this.detectMeasurementPaths(measurement);
    const l = paths.length;
    if (l === 0) {
      return '-';
    } else if (l === 1) {
      const m = get(measurement, paths[0]);
      let { value, unit } = m;
      if (!isNaN(+value)) {
        value = this.number.transform(value, round ?? 'ceil', digitsInfo ?? '1.1-2');
      }
      return unit?.length ? `${value} ${unit}` : `${value}`;
    } else {
      return `Found multiple measurements (${l}).`;
    }
  }

  private detectMeasurementPaths(m: IMeasurement): string[] {
    const nope = ['id', 'type', 'time', 'self', 'source'];
    const result: string[] = [];
    const fragmentCandidates = Object.keys(m).filter((key) => !nope.includes(key));
    for (const key of fragmentCandidates) {
      const fragment = get(m, key);
      const nestedKeys = Object.keys(fragment);
      for (const nestedKey of nestedKeys) {
        if (has(fragment, `${nestedKey}.value`)) {
          result.push(`${key}.${nestedKey}`);
        }
      }
    }
    return result;
  }
}
