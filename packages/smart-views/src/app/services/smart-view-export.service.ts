import { inject, Injectable } from '@angular/core';
import { IManagedObject, InventoryService, QueriesUtil } from '@c8y/client';

/**
 * Fetches all inventory items that match a raw Cumulocity OData filter query,
 * automatically paginating through all result pages.
 *
 * Provide at component level so each export operation gets its own instance.
 */
@Injectable()
export class SmartViewExportService {
  private readonly inventoryService = inject(InventoryService);
  private readonly queriesUtil = new QueriesUtil();

  /** Maximum page size supported by the Cumulocity inventory API. */
  private static readonly PAGE_SIZE = 2000;

  /**
   * Returns the total number of inventory items matching `rawQuery`.
   * Uses `pageSize: 1` so that `paging.totalPages` equals the item count.
   */
  async countItems(rawQuery: string): Promise<number> {
    const { paging } = await this.inventoryService.list({
      query: this.toInventoryQuery(rawQuery),
      pageSize: 1,
      currentPage: 1,
      withTotalPages: true,
    });

    return paging?.totalPages ?? 0;
  }

  /**
   * Fetches **all** inventory items matching `rawQuery`, paginating with the
   * maximum page size. Calls `onProgress` with a 0–100 percentage after each
   * page so callers can update a progress indicator.
   */
  async fetchAll(
    rawQuery: string,
    onProgress: (percent: number) => void
  ): Promise<IManagedObject[]> {
    const query = this.toInventoryQuery(rawQuery);
    const pageSize = SmartViewExportService.PAGE_SIZE;

    // First page also gives us the total page count.
    const { data: firstPage, paging } = await this.inventoryService.list({
      query,
      pageSize,
      currentPage: 1,
      withTotalPages: true,
    });

    const totalPages = paging?.totalPages ?? 1;
    const allItems: IManagedObject[] = [...firstPage];

    onProgress(totalPages <= 1 ? 100 : Math.round((1 / totalPages) * 100));

    for (let page = 2; page <= totalPages; page++) {
      const { data } = await this.inventoryService.list({
        query,
        pageSize,
        currentPage: page,
        withTotalPages: false,
      });

      allItems.push(...data);
      onProgress(Math.round((page / totalPages) * 100));
    }

    return allItems;
  }

  /**
   * Converts the raw OData filter string stored in `c8y_SmartViewConfiguration.query`
   * into a full Cumulocity inventory query string using `QueriesUtil`.
   */
  private toInventoryQuery(rawQuery: string): string {
    return this.queriesUtil.buildQuery({
      __filter: { __useFilterQueryString: rawQuery },
    });
  }
}
