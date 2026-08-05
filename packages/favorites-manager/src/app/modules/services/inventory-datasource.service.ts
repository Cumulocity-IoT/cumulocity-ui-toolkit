import { Injectable } from '@angular/core';
import { Column, DataSourceModifier, ServerSideDataResult } from '@c8y/ngx-components';
import { QueryFilter } from '../models/query-utils.model';
import { hasSearchableConfig, SearchColumn } from '../models/data-grid.model';
import { BaseInventoryDatasourceService } from './base-inventory-datasource.service';

@Injectable({ providedIn: 'root' })
export class InventoryDatasourceService extends BaseInventoryDatasourceService {
  async reload(
    dataSourceModifier: DataSourceModifier,
    baseQuery: QueryFilter
  ): Promise<ServerSideDataResult> {
    const { columns, pagination, searchText } = dataSourceModifier;
    const filterQuery = this.createQueryJSON(columns, baseQuery)
      .addFilterAttribute(this.createSearchJSON(columns, searchText))
      .addOrderBys(this.createOrderBySortingConfig(columns))
      .toString();
    const allQuery = this.createQueryJSON([], baseQuery).toString();

    const mosForPage = this.fetchManagedObjectsForPage(filterQuery, pagination);
    const filtered = this.fetchManagedObjectsCount(filterQuery);
    const total = this.fetchManagedObjectsCount(allQuery);
    const [managedObjects, filteredSize, size] = await Promise.all([mosForPage, filtered, total]);

    const result = {
      size,
      filteredSize,
      ...managedObjects,
    } as unknown as ServerSideDataResult;

    return result;
  }

  private createOrderBySortingConfig(columns: Column[]) {
    const orderBys: { [key: string]: 1 | -1 }[] = [];

    const customColumns: Column[] = columns.filter(
      (column) => column.sortingConfig && column.sortingConfig?.pathSortingConfigs?.length
    );

    for (const c of customColumns) {
      const sortOrder = c.sortOrder === 'asc' ? 1 : -1;

      for (const config of c.sortingConfig?.pathSortingConfigs ?? []) {
        orderBys.push({
          [config.path]: sortOrder,
        });
      }
    }

    return orderBys;
  }

  private createSearchJSON(columns: Column[], search: string): Record<string, unknown> | undefined {
    // Declaring `object` while returning nothing was a type lie; callers already
    // spread the result, so `undefined` is the honest "no search filter".
    if (!search || !search.length) {
      return undefined;
    }

    const text = `*${isNaN(+search) ? this.caseInsensitivify(search) : search}*`;
    const orArray: object[] = [];

    columns
      .filter((column) => hasSearchableConfig(column) && column.searchable)
      .forEach((column: SearchColumn) => {
        if (column.path) {
          orArray.push({ __eq: { [column.path]: text } });
        }
      });

    const orFilter = { __or: orArray };
    return orFilter;
  }

  private caseInsensitivify(value: string): string {
    let res = '';

    for (let i = 0; i < value.length; i++) {
      const char = value.charAt(i);

      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      char.match(/[a-z]/i)
        ? (res = res + '[' + char.toLowerCase() + char.toUpperCase() + ']')
        : (res = res + '' + char);
    }

    return res;
  }
}
