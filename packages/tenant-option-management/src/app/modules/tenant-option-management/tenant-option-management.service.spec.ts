import { TestBed } from '@angular/core/testing';
import {
  InventoryService,
  IResultList,
  ITenantOption,
  TenantOptionsService,
  UserService,
} from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { provideMock } from '~helpers/auto-mock.helper';
import { TenantOptionManagementService } from './tenant-option-management.service';

const mockPaging = (currentPage: number, totalPages: number) => ({
  currentPage,
  totalPages,
  pageSize: 2000,
  nextPage: currentPage + 1,
  prevPage: currentPage - 1,
  totalElements: 0,
});

const makeOption = (category: string, key: string, value = 'v'): ITenantOption => ({
  category,
  key,
  value,
});

const makeListResult = (
  data: ITenantOption[],
  currentPage: number,
  totalPages: number
): IResultList<ITenantOption> =>
  ({
    data,
    res: {} as Response,
    paging: mockPaging(currentPage, totalPages) as never,
  }) as IResultList<ITenantOption>;

describe('TenantOptionManagementService', () => {
  let service: TenantOptionManagementService;
  let tenantOptionsService: TenantOptionsService;
  let inventoryService: InventoryService;
  let userService: UserService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TenantOptionManagementService,
        provideMock(TenantOptionsService),
        provideMock(InventoryService),
        provideMock(UserService),
        provideMock(AlertService),
      ],
    });

    service = TestBed.inject(TenantOptionManagementService);
    tenantOptionsService = TestBed.inject(TenantOptionsService);
    inventoryService = TestBed.inject(InventoryService);
    userService = TestBed.inject(UserService);
  });

  describe('allowListCategory', () => {
    beforeEach(() => {
      jest.spyOn(userService, 'current').mockResolvedValue({
        data: { id: 'user1', email: 'user@example.com' },
      } as never);

      jest.spyOn(inventoryService, 'list').mockResolvedValue({
        data: [],
        res: {} as Response,
      } as never);

      jest.spyOn(inventoryService, 'create').mockResolvedValue({
        data: { id: 'config1', options: [] },
        res: {} as Response,
      } as never);

      jest.spyOn(inventoryService, 'update').mockResolvedValue({
        data: { id: 'config1', options: [] },
        res: {} as Response,
      } as never);
    });

    it('should reject when no tenant options exist for the given category', async () => {
      jest.spyOn(tenantOptionsService, 'list').mockResolvedValueOnce(makeListResult([], 1, 1));

      let caughtError: unknown;

      try {
        await service.allowListCategory('unknown-category');
      } catch (e) {
        caughtError = e;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect((caughtError as Error).message).toBe(
        'No tenant options found for category "unknown-category"'
      );
    });

    it('should return rows for all options in the category on a single page', async () => {
      const options = [
        makeOption('mycat', 'key1', 'val1'),
        makeOption('mycat', 'key2', 'val2'),
        makeOption('other', 'keyX', 'valX'), // different category – must be ignored
      ];

      jest.spyOn(tenantOptionsService, 'list').mockResolvedValueOnce(makeListResult(options, 1, 1));

      const rows = await service.allowListCategory('mycat');

      expect(rows).toHaveLength(2);
      expect(rows[0].id).toBe('mycat-key1');
      expect(rows[1].id).toBe('mycat-key2');
    });

    it('should fetch subsequent pages when totalPages > 1', async () => {
      const page1Options = [makeOption('cat', 'a'), makeOption('cat', 'b')];
      const page2Options = [makeOption('cat', 'c')];
      const listSpy = jest
        .spyOn(tenantOptionsService, 'list')
        .mockResolvedValueOnce(makeListResult(page1Options, 1, 2))
        .mockResolvedValueOnce(makeListResult(page2Options, 2, 2));

      const rows = await service.allowListCategory('cat');

      expect(listSpy).toHaveBeenCalledTimes(2);
      expect(rows).toHaveLength(3);
      expect(rows.map((r) => r.id)).toEqual(['cat-a', 'cat-b', 'cat-c']);
    });

    it('should silently skip options that are already in the configuration', async () => {
      const options = [makeOption('cat', 'exists'), makeOption('cat', 'new')];

      jest.spyOn(tenantOptionsService, 'list').mockResolvedValueOnce(makeListResult(options, 1, 1));

      // Simulate "exists" already being tracked: addOptionToConfiguration rejects for it
      jest.spyOn(inventoryService, 'list').mockResolvedValue({
        data: [{ id: 'config1', options: [{ category: 'cat', key: 'exists' }] }],
        res: {} as Response,
      } as never);

      jest.spyOn(inventoryService, 'update').mockResolvedValue({
        data: { id: 'config1', options: [] },
        res: {} as Response,
      } as never);

      const rows = await service.allowListCategory('cat');

      // 'exists' was already tracked, so it gets silently dropped; only 'new' is returned
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe('cat-new');
    });

    it('should return an empty rows array when all options are already tracked', async () => {
      const options = [makeOption('cat', 'key1')];

      jest.spyOn(tenantOptionsService, 'list').mockResolvedValueOnce(makeListResult(options, 1, 1));

      // Simulate option already tracked (addOptionToConfiguration rejects)
      jest.spyOn(inventoryService, 'list').mockResolvedValue({
        data: [{ id: 'config1', options: [{ category: 'cat', key: 'key1' }] }],
        res: {} as Response,
      } as never);

      const rows = await service.allowListCategory('cat');

      expect(rows).toHaveLength(0);
    });
  });
});
