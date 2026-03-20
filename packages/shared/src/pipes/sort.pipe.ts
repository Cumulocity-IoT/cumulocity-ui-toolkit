import { Pipe, PipeTransform } from '@angular/core';
import { sortBy } from 'lodash';

@Pipe({ name: 'sort', standalone: false })
export class SortPipe implements PipeTransform {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform(values: any[], attr: string): any[] {
    if (typeof values === 'string') {
      values = Array(values);
    } else if (!Array.isArray(values)) {
      return [];
    }

    return sortBy(values, attr);
  }
}
