import { inject, Injectable } from '@angular/core';
import { InventoryService, IResultList, IManagedObject, QueriesUtil } from '@c8y/client';
import { Column, Pagination } from '@c8y/ngx-components';
import { cloneDeep } from 'lodash';
import { QueryFilter } from '../models/query-utils.model';

export interface QueryJSON {
  __filter: QueryFilter;

  __orderby: { [key: string]: 1 | -1 }[];
}

export class QueryJSONRepresentation {
  private readonly queriesUtil = new QueriesUtil();

  __filter: QueryFilter = {};

  __orderby: { [key: string]: 1 | -1 }[] = [];

  constructor(baseQuery?: QueryFilter) {
    if (baseQuery) {
      this.__filter = cloneDeep(baseQuery);
    }
  }

  toString(): string {
    return this.queriesUtil.buildQuery({
      __filter: this.__filter as Record<string, unknown>,
      __orderby: this.__orderby,
    });
  }

  addFilterAttribute(attribute: Record<string, unknown> | undefined) {
    this.__filter = { ...this.__filter, ...attribute };

    return this;
  }

  addOrderBys(orderBys: { [key: string]: 1 | -1 }[]) {
    this.__orderby.push(...orderBys);

    return this;
  }
}

@Injectable({ providedIn: 'root' })
export class BaseInventoryDatasourceService {
  protected inventoryService = inject(InventoryService);

  fetchManagedObjectsForPage(
    query: string,
    paging: Pagination
  ): Promise<IResultList<IManagedObject>> {
    const filter = {
      query,
      ...paging,
      withParents: true,
      withTotalPages: false,
    };
    return this.inventoryService.list(filter);
  }

  fetchManagedObjectsCount(query: string): Promise<number> {
    const filter = {
      query,
      pageSize: 1,
      currentPage: 1,
      withTotalPages: true,
    };
    return this.inventoryService.list(filter).then((result) => result.paging?.totalPages ?? 0);
  }

  createQueryJSON(columns: Column[], baseQuery: QueryFilter = {}): QueryJSONRepresentation {
    const json = new QueryJSONRepresentation(baseQuery);

    for (const column of columns) {
      this.extendQueryByColumn(json, column);
    }

    return json;
  }

  extendQueryByColumn = (json: QueryJSON, column: Column) => {
    if (column.filterable) {
      if (typeof column.filterPredicate === 'string' && column.path) {
        json.__filter[column.path] = column.filterPredicate;
      }

      if (column.externalFilterQuery && column.filteringConfig) {
        json.__filter.__and ??= [];
        json.__filter.__and.push(
          column.filteringConfig.getFilter(column.externalFilterQuery) as Record<string, unknown>
        );
      }
    }

    if (column.sortOrder && column.path) {
      const sortOrder: { [key: string]: 1 | -1 } = {
        [column.path]: column.sortOrder === 'asc' ? 1 : -1,
      };

      json.__orderby.push(sortOrder);
    }

    return json;
  };
}
