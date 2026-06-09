import { Injectable, inject } from '@angular/core';
import {
  IManagedObject,
  IResultList,
  InventoryService,
  QueriesUtil,
  QueryObject,
  QueryObjectFilterComparison,
} from '@c8y/client';
import {
  Column,
  DataSourceModifier,
  Pagination,
  ServerSideDataCallback,
  ServerSideDataResult,
} from '@c8y/ngx-components';
import { SmartViewConfiguration } from '../models/smart-view-configuration.model';

interface SearchableColumn extends Column {
  searchable: boolean;
}

function isSearchable(col: Column): col is SearchableColumn {
  return Object.hasOwn(col, 'searchable') && (col as SearchableColumn).searchable === true;
}

/**
 * Inventory datasource for the smart-view data grid.
 *
 * The raw OData filter string from `c8y_SmartViewConfiguration.query` is
 * embedded via `__useFilterQueryString` each time a query is built, so it can
 * be freely combined with search (`__or` across searchable columns) and sort
 * (`__orderby`) on every modifier change.
 *
 * Provide at component level so each smart-view instance gets its own copy.
 */
@Injectable()
export class SmartViewDatasourceService {
  private readonly inventoryService = inject(InventoryService);
  private readonly queriesUtil = new QueriesUtil();

  /** Raw OData filter string as stored in the managed object, e.g.
   * `"type eq 'c8y_building' and has(c8y_IsAsset)"`. */
  private rawQuery = '';

  /** Bound callback handed directly to `<c8y-data-grid [serverSideDataCallback]>`. */
  readonly serverSideDataCallback: ServerSideDataCallback = this.onDataSourceModifier.bind(this);

  /**
   * Initialises the datasource from a {@link SmartViewConfiguration}.
   * Stores the raw query string so it can be combined with search and sort on
   * every modifier change without pre-building an intermediate string.
   */
  configure(config: SmartViewConfiguration): void {
    this.rawQuery = config.query;
  }

  private async onDataSourceModifier(modifier: DataSourceModifier): Promise<ServerSideDataResult> {
    const { columns, pagination, searchText } = modifier;

    const filterQuery = this.buildQuery(columns, searchText);
    const totalQuery = this.buildQuery([], '');

    const [page, filteredSize, size] = await Promise.all([
      this.fetchPage(filterQuery, pagination),
      this.fetchCount(filterQuery),
      this.fetchCount(totalQuery),
    ]);

    return { size, filteredSize, ...page };
  }

  /**
   * Builds a full inventory `query` string combining:
   * - the raw base filter via `__useFilterQueryString`
   * - column filter predicates (`filterPredicate`) and external filter queries
   * - an optional search `__or` across all searchable columns
   * - column sort orders via `__orderby`
   *
   * All active filter parts are joined with `__and`.
   */
  private buildQuery(columns: Column[], searchText: string): string {
    const filterParts: QueryObjectFilterComparison[] = [
      { __useFilterQueryString: this.rawQuery },
      ...this.buildColumnFilters(columns),
    ];

    const searchFilter = this.buildSearchFilter(columns, searchText);

    if (searchFilter) {
      filterParts.push(searchFilter);
    }

    const baseFilter: QueryObjectFilterComparison =
      filterParts.length === 1 ? filterParts[0] : { __and: filterParts };

    const orderby = columns
      .filter((c) => c.sortOrder && c.path)
      .map((c) => ({ [c.path]: c.sortOrder === 'asc' ? (1 as const) : (-1 as const) }));

    const queryObject: QueryObject = orderby.length
      ? { __filter: baseFilter, __orderby: orderby }
      : { __filter: baseFilter };

    return this.queriesUtil.buildQuery(queryObject);
  }

  /**
   * Mirrors `BaseInventoryDatasourceService.extendQueryByColumn`.
   *
   * - `filterPredicate` (set by the column header text input) is added as a
   *   direct path equality: `{ [path]: predicate }`.
   * - `externalFilterQuery` + `filteringConfig` (custom filter renderers) are
   *   resolved via `filteringConfig.getFilter()` and added verbatim.
   */
  private buildColumnFilters(columns: Column[]): QueryObjectFilterComparison[] {
    const filters: QueryObjectFilterComparison[] = [];

    for (const column of columns) {
      if (!column.filterable) {
        continue;
      }

      if (typeof column.filterPredicate === 'string' && column.path) {
        filters.push({ [column.path]: column.filterPredicate });
      }

      if (column.externalFilterQuery && column.filteringConfig) {
        const filter = column.filteringConfig.getFilter(column.externalFilterQuery) as
          | QueryObjectFilterComparison
          | undefined;

        if (filter) {
          filters.push(filter);
        }
      }
    }

    return filters;
  }

  /**
   * Builds an `__or` filter that matches `searchText` (as a case-insensitive
   * glob) against every column marked `searchable: true`.
   * Returns `null` when there is no text or no searchable columns.
   */
  private buildSearchFilter(
    columns: Column[],
    searchText: string
  ): QueryObjectFilterComparison | null {
    if (!searchText) {
      return null;
    }

    const searchable = columns.filter((c) => isSearchable(c) && c.path);

    if (!searchable.length) {
      return null;
    }

    const text = `*${searchText}*`;
    const orArray = searchable.map((c) => ({ __eq: { [c.path]: text } }));

    return { __or: orArray };
  }

  private fetchPage(query: string, pagination: Pagination): Promise<IResultList<IManagedObject>> {
    return this.inventoryService.list({
      query,
      withParents: true,
      pageSize: pagination.pageSize,
      currentPage: pagination.currentPage,
      withTotalPages: false,
    });
  }

  private fetchCount(query: string): Promise<number> {
    return this.inventoryService
      .list({ query, pageSize: 1, currentPage: 1, withTotalPages: true })
      .then((r) => r.paging?.totalPages ?? 0);
  }
}
