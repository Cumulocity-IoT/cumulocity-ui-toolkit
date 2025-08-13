import { Pipe, PipeTransform } from '@angular/core';
import { IMeasurement, IMeasurementValue } from '@c8y/client';
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
      const { value, unit } = get(measurement, paths[0]) as IMeasurementValue;
      let returnValue: string | number = value;

      if (!isNaN(+value)) {
        returnValue = this.number.transform(value, round ?? 'ceil', digitsInfo ?? '1.1-2');
      }

      return unit?.length ? `${returnValue} ${unit}` : `${returnValue}`;
    } else {
      return `Found multiple measurements (${l}).`;
    }
  }

  private detectMeasurementPaths(measurement: IMeasurement): string[] {
    const nope = ['id', 'type', 'time', 'self', 'source'];
    const result: string[] = [];
    const fragmentCandidates = Object.keys(measurement).filter((key) => !nope.includes(key));

    for (const key of fragmentCandidates) {
      const fragment = get(measurement, key) as string;
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
