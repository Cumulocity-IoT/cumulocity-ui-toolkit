import { Pipe, PipeTransform } from '@angular/core';

export interface FilterPipeValue {
  attr: string;
  value: string | number | boolean;
}
@Pipe({
  name: 'filter',
})
export class FilterPipe implements PipeTransform {
  transform<T>(data: T[], filterValue: FilterPipeValue[]): T[] {
    if (!filterValue || !filterValue.length) {
      return data;
    }

    const returnData: T[] = [];

    data.forEach((item) => {
      if (this.filterBy(item, filterValue)) {
        returnData.push(item);
      }
    });

    return returnData;
  }

  private unify(value: unknown): string {
    switch (typeof value) {
      case 'string':
        return value.toLocaleUpperCase();
      case 'number':
      case 'boolean':
        return value.toString();
      default:
        return '';
    }
  }

  private filterBy<T>(item: T, filter: FilterPipeValue[]): T {
    let check = true;

    filter.forEach((f) => {
      if (check === true) {
        check = check && this.unify(item[f.attr]).includes(this.unify(f.value));
      }
    });

    return check ? item : null;
  }
}
