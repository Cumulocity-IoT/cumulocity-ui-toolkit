import { TestBed } from '@angular/core/testing';
import { InventoryService } from '@c8y/client';
import { provideMock } from '~helpers/auto-mock.helper';
import { SmartViewExportService } from './smart-view-export.service';

/** Cast an autoMock'd method to a Jasmine spy so we can configure its return value. */
function asSpy<T>(fn: T): jasmine.Spy {
  return fn as unknown as jasmine.Spy;
}

/** Minimal `InventoryService.list` result: `data` plus the paging block we read. */
function listResult(data: unknown[], totalPages?: number) {
  return Promise.resolve({ data, paging: totalPages === undefined ? undefined : { totalPages } });
}

describe('SmartViewExportService', () => {
  let service: SmartViewExportService;
  let inventoryService: InventoryService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SmartViewExportService, provideMock(InventoryService)],
    });

    service = TestBed.inject(SmartViewExportService);
    inventoryService = TestBed.inject(InventoryService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('countItems', () => {
    it('reads the item count from paging.totalPages using pageSize 1', async () => {
      asSpy(inventoryService.list).and.returnValue(listResult([{ id: '1' }], 42));

      // `__useFilterQueryString` keeps only what sits inside the outermost
      // parentheses of the `$filter`, which is the shape smart groups store.
      const rawQuery = "$filter=(name eq 'RaspPi*') $orderby=name asc";

      await expectAsync(service.countItems(rawQuery)).toBeResolvedTo(42);

      const options = asSpy(inventoryService.list).calls.mostRecent().args[0];

      expect(options.pageSize).toBe(1);
      expect(options.currentPage).toBe(1);
      expect(options.withTotalPages).toBeTrue();
      expect(options.query).toContain("name eq 'RaspPi*'");
      expect(options.query).not.toContain('$orderby');
    });

    it('returns 0 when the response carries no paging block', async () => {
      asSpy(inventoryService.list).and.returnValue(listResult([]));

      await expectAsync(service.countItems('$filter=(has(c8y_IsDevice))')).toBeResolvedTo(0);
    });
  });

  describe('fetchAll', () => {
    it('returns the single page and reports 100% when there is only one page', async () => {
      asSpy(inventoryService.list).and.returnValue(listResult([{ id: '1' }, { id: '2' }], 1));
      const progress: number[] = [];

      const items = await service.fetchAll('$filter=(has(c8y_IsDevice))', (p) => progress.push(p));

      expect(items.length).toBe(2);
      expect(progress).toEqual([100]);
      expect(asSpy(inventoryService.list).calls.count()).toBe(1);
    });

    it('paginates through every page and reports progress per page', async () => {
      asSpy(inventoryService.list).and.callFake((options: { currentPage?: number }) =>
        listResult([{ id: `page-${options.currentPage}` }], 4)
      );
      const progress: number[] = [];

      const items = await service.fetchAll('$filter=(has(c8y_IsDevice))', (p) => progress.push(p));

      expect(items.map((i) => i.id)).toEqual(['page-1', 'page-2', 'page-3', 'page-4']);
      expect(progress).toEqual([25, 50, 75, 100]);
    });

    it('requests the maximum page size and only asks for totals on the first page', async () => {
      asSpy(inventoryService.list).and.callFake((options: { currentPage?: number }) =>
        listResult([{ id: `page-${options.currentPage}` }], 2)
      );

      await service.fetchAll('$filter=(has(c8y_IsDevice))', () => undefined);

      const [first, second] = asSpy(inventoryService.list)
        .calls.allArgs()
        .map(([o]) => o);

      expect(first.pageSize).toBe(2000);
      expect(first.withTotalPages).toBeTrue();
      expect(second.currentPage).toBe(2);
      expect(second.withTotalPages).toBeFalse();
    });
  });
});
