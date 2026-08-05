import { Pipe, PipeTransform } from '@angular/core';

export interface FilterPipeValue {
  attr: string;
  value: string | number | boolean;
}
@Pipe({
  name: 'filter',
  standalone: true,
})
export class FilterPipe implements PipeTransform {
  transform<T extends Record<string, unknown>>(data: T[], filterValue: FilterPipeValue[]): T[] {
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

  /**
   * Returns whether the item matches every filter. Previously returned the item
   * or `null` while declaring `T`, even though the caller used it as a boolean.
   */
  private filterBy<T extends Record<string, unknown>>(item: T, filter: FilterPipeValue[]): boolean {
    return filter.every((f) => this.unify(item[f.attr]).includes(this.unify(f.value)));
  }
}
