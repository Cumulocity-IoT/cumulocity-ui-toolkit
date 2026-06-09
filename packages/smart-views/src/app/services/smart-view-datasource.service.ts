import { Injectable, inject } from '@angular/core';
import {
  IManagedObject,
  IResultList,
  InventoryService,
  QueriesUtil,
  QueryObject,
} from '@c8y/client';
import {
  Column,
  DataSourceModifier,
  Pagination,
  ServerSideDataCallback,
  ServerSideDataResult,
} from '@c8y/ngx-components';
import { SmartViewConfiguration } from '../models/smart-view-configuration.model';

/**
 * Inventory datasource for the smart-view data grid.
 *
 * Converts the raw OData filter string stored in
 * `c8y_SmartViewConfiguration.query` into a proper {@link QueryObject} via the
 * `__useFilterQueryString` escape-hatch (the "reverse query" approach), then
 * delegates paged fetches to {@link InventoryService}.
 *
 * Provide at component level so each smart-view instance gets its own copy.
 */
@Injectable()
export class SmartViewDatasourceService {
  private readonly inventoryService = inject(InventoryService);
  private readonly queriesUtil = new QueriesUtil();

  /** Resolved query string sent to the Inventory API `query` param. */
  private queryString = '';

  /** Bound callback handed directly to `<c8y-data-grid [serverSideDataCallback]>`. */
  readonly serverSideDataCallback: ServerSideDataCallback = this.onDataSourceModifier.bind(this);

  /**
   * Initialises the datasource from a {@link SmartViewConfiguration}.
   *
   * The raw query string (e.g. `"type eq 'c8y_building' and has(c8y_IsAsset)"`)
   * is wrapped inside `{ __filter: { __useFilterQueryString: rawQuery } }` —
   * the reverse-query pattern — and then built back to the formatted query
   * string expected by the Inventory API.
   */
  configure(config: SmartViewConfiguration): void {
    const queryObject: QueryObject = {
      __filter: {
        __useFilterQueryString: config.query,
      },
    };

    this.queryString = this.queriesUtil.buildQuery(queryObject);
  }

  private async onDataSourceModifier(modifier: DataSourceModifier): Promise<ServerSideDataResult> {
    if (!this.queryString) {
      return this.fetchPage({ query: 'has(nonExistent_placeholder)' }, modifier.pagination).then(
        (r) => ({ size: 0, filteredSize: 0, ...r })
      );
    }

    const baseFilter = { query: this.queryString };
    const extendedFilter = this.applyColumnFilters(modifier.columns, baseFilter);

    const [page, filteredSize, size] = await Promise.all([
      this.fetchPage(extendedFilter, modifier.pagination),
      this.fetchCount(extendedFilter),
      this.fetchCount(baseFilter),
    ]);

    return { size, filteredSize, ...page };
  }

  private fetchPage(filter: object, pagination: Pagination): Promise<IResultList<IManagedObject>> {
    return this.inventoryService.list({
      ...filter,
      withParents: true,
      pageSize: pagination.pageSize,
      currentPage: pagination.currentPage,
      withTotalPages: false,
    });
  }

  private fetchCount(filter: object): Promise<number> {
    return this.inventoryService
      .list({ ...filter, pageSize: 1, currentPage: 1, withTotalPages: true })
      .then((r) => r.paging?.totalPages ?? 0);
  }

  /**
   * Extends the base query with column sort orders.
   * Column text filters are not supported for raw query-string based views.
   */
  private applyColumnFilters(columns: Column[], baseFilter: { query: string }): { query: string } {
    const orderby = columns
      .filter((c) => c.sortOrder && c.path)
      .map((c) => ({ [c.path]: c.sortOrder === 'asc' ? (1 as const) : (-1 as const) }));

    if (!orderby.length) {
      return baseFilter;
    }

    const queryObject: QueryObject = {
      __filter: { __useFilterQueryString: baseFilter.query.replace(/^\$filter=\((.+)\).*$/, '$1') },
      __orderby: orderby,
    };

    return { query: this.queriesUtil.buildQuery(queryObject) };
  }
}
