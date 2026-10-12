import { TestBed } from '@angular/core/testing';
import {
  IFetchResponse,
  InventoryService,
  ITenantOption,
  TenantOptionsService,
  UserService,
} from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { provideMock } from '~helpers/auto-mock.helper';
import { TenantOptionConfiguration, TenantOptionRow } from './tenant-option-management.model';
import { TenantOptionManagementService } from './tenant-option-management.service';

const FETCH_RES = {} as IFetchResponse;

/** Returns a minimal config managed-object stub. */
function makeConfig(options: TenantOptionConfiguration['options'] = []): TenantOptionConfiguration {
  return { id: 'cfg-1', type: 'tenant_option_plugin_config', options } as TenantOptionConfiguration;
}

describe('TenantOptionManagementService', () => {
  let service: TenantOptionManagementService;
  let inventoryService: jasmine.SpyObj<InventoryService>;
  let tenantOptionsService: jasmine.SpyObj<TenantOptionsService>;
  let alertService: jasmine.SpyObj<AlertService>;
  let userService: jasmine.SpyObj<UserService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TenantOptionManagementService,
        provideMock(InventoryService),
        provideMock(TenantOptionsService),
        provideMock(AlertService),
        provideMock(UserService),
        provideMock(TranslateService),
      ],
    });

    service = TestBed.inject(TenantOptionManagementService);
    inventoryService = TestBed.inject(InventoryService) as jasmine.SpyObj<InventoryService>;
    tenantOptionsService = TestBed.inject(
      TenantOptionsService
    ) as jasmine.SpyObj<TenantOptionsService>;
    alertService = TestBed.inject(AlertService) as jasmine.SpyObj<AlertService>;
    userService = TestBed.inject(UserService) as jasmine.SpyObj<UserService>;

    // Default user stub used by addOptionToConfiguration / updateOptionForConfiguration.
    userService.current.and.returnValue(
      Promise.resolve({
        data: {
          id: 'user-1',
          email: 'user@example.com',
          userName: 'user-1',
          displayName: 'User',
        } as any,
        res: FETCH_RES,
      })
    );
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ─── getConfiguration() ─────────────────────────────────────────────────────

  describe('getConfiguration()', () => {
    it('returns the existing config managed object when found', async () => {
      const cfg = makeConfig();

      inventoryService.list.and.returnValue(Promise.resolve({ data: [cfg], res: FETCH_RES }));

      const result = await service.getConfiguration();

      expect(result.id).toBe('cfg-1');
      expect(inventoryService.create).not.toHaveBeenCalled();
    });

    it('creates and returns a new config when none exists', async () => {
      const newCfg = makeConfig();

      inventoryService.list.and.returnValue(Promise.resolve({ data: [], res: FETCH_RES }));
      inventoryService.create.and.returnValue(Promise.resolve({ data: newCfg, res: FETCH_RES }));

      const result = await service.getConfiguration();

      expect(inventoryService.create).toHaveBeenCalledWith(
        jasmine.objectContaining({ type: 'tenant_option_plugin_config' })
      );
      expect(result).toBe(newCfg);
    });
  });

  // ─── addOptionToConfiguration() ─────────────────────────────────────────────

  describe('addOptionToConfiguration()', () => {
    it('rejects with an error when the category+key already exists', async () => {
      const existing = { category: 'my-cat', key: 'my-key', lastUpdated: '', user: '' };

      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(makeConfig([existing])));

      await expectAsync(
        service.addOptionToConfiguration({ category: 'my-cat', key: 'my-key' })
      ).toBeRejectedWithError('Tenant option already exists!');
    });

    it('appends the new item and calls inventoryService.update', async () => {
      const cfg = makeConfig();

      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(cfg));
      inventoryService.update.and.returnValue(Promise.resolve({ data: cfg, res: FETCH_RES }));

      await service.addOptionToConfiguration({ category: 'cat', key: 'key' });

      expect(inventoryService.update).toHaveBeenCalledWith(
        jasmine.objectContaining({ id: cfg.id })
      );
    });

    it('returns an item with the correct category, key, and user', async () => {
      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(makeConfig()));
      inventoryService.update.and.returnValue(
        Promise.resolve({ data: makeConfig(), res: FETCH_RES })
      );

      const item = await service.addOptionToConfiguration({ category: 'cat', key: 'key' });

      expect(item.category).toBe('cat');
      expect(item.key).toBe('key');
      expect(item.user).toBe('user-1');
      expect(item.lastUpdated).toBeDefined();
    });
  });

  // ─── updateOptionForConfiguration() ─────────────────────────────────────────

  describe('updateOptionForConfiguration()', () => {
    it('rejects when the category+key does not exist in config', async () => {
      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(makeConfig()));

      await expectAsync(
        service.updateOptionForConfiguration({ category: 'missing', key: 'key' })
      ).toBeRejectedWithError('Tenant option configuration does not exist!');
    });

    it('updates lastUpdated and user on the existing item', async () => {
      const existing = {
        category: 'cat',
        key: 'key',
        lastUpdated: '2023-01-01T00:00:00.000Z',
        user: 'old-user',
      };
      const cfg = makeConfig([existing]);

      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(cfg));
      inventoryService.update.and.returnValue(Promise.resolve({ data: cfg, res: FETCH_RES }));

      const item = await service.updateOptionForConfiguration({ category: 'cat', key: 'key' });

      expect(item.user).toBe('user-1');
      expect(item.lastUpdated).not.toBe('2023-01-01T00:00:00.000Z');
    });
  });

  // ─── getAllOptions() ─────────────────────────────────────────────────────────

  describe('getAllOptions()', () => {
    it('maps a single-page response to id+value pairs', async () => {
      const options: ITenantOption[] = [
        { category: 'a', key: '1', value: 'val-1' },
        { category: 'b', key: '2', value: 'val-2' },
      ];

      tenantOptionsService.list.and.returnValue(
        Promise.resolve({
          data: options,
          paging: { currentPage: 1, totalPages: 1 } as never,
          res: FETCH_RES,
        })
      );

      const result = await service.getAllOptions();

      expect(result).toHaveSize(2);
      expect(result[0]).toEqual({ id: 'a-1', value: 'val-1' });
      expect(result[1]).toEqual({ id: 'b-2', value: 'val-2' });
    });

    it('fetches subsequent pages when totalPages > 1', async () => {
      const page1: ITenantOption[] = [{ category: 'a', key: '1', value: 'v1' }];
      const page2: ITenantOption[] = [{ category: 'b', key: '2', value: 'v2' }];

      tenantOptionsService.list.and.returnValues(
        Promise.resolve({
          data: page1,
          paging: { currentPage: 1, totalPages: 2 } as never,
          res: FETCH_RES,
        }),
        Promise.resolve({
          data: page2,
          paging: { currentPage: 2, totalPages: 2 } as never,
          res: FETCH_RES,
        })
      );

      const result = await service.getAllOptions();

      expect(result).toHaveSize(2);
      expect(tenantOptionsService.list).toHaveBeenCalledTimes(2);
    });

    it('returns [] and calls alertService.danger on API failure', async () => {
      tenantOptionsService.list.and.returnValue(Promise.reject(new Error('API error')));

      const result = await service.getAllOptions();

      expect(result).toEqual([]);
      expect(alertService.danger).toHaveBeenCalled();
    });
  });

  // ─── allowListOptionsByCategory() ───────────────────────────────────────────

  describe('allowListOptionsByCategory()', () => {
    it('imports every new option of the category in one batch and returns them', async () => {
      const options: ITenantOption[] = [
        { category: 'cat', key: 'k1', value: 'v1' },
        { category: 'cat', key: 'k2', value: 'v2' },
      ];

      tenantOptionsService.list.and.returnValue(
        Promise.resolve({
          data: options,
          paging: { currentPage: 1, totalPages: 1 } as never,
          res: FETCH_RES,
        })
      );

      const cfg = makeConfig();

      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(cfg));
      inventoryService.update.and.returnValue(Promise.resolve({ data: cfg, res: FETCH_RES }));

      const rows = await service.allowListOptionsByCategory('cat');

      expect(rows).toHaveSize(2);
      expect(rows.map((r) => r.id)).toEqual(['cat-k1', 'cat-k2']);
      expect(tenantOptionsService.list).toHaveBeenCalledWith(
        jasmine.objectContaining({ category: 'cat' })
      );
      expect(inventoryService.update).toHaveBeenCalledWith(
        jasmine.objectContaining({ id: cfg.id })
      );

      const updateCall = inventoryService.update.calls.mostRecent().args[0] as {
        options: unknown[];
      };

      expect(updateCall.options).toHaveSize(2);
    });

    it('skips options whose category+key already exist in the configuration', async () => {
      const options: ITenantOption[] = [
        { category: 'cat', key: 'k1', value: 'v1' },
        { category: 'cat', key: 'k2', value: 'v2' },
      ];

      tenantOptionsService.list.and.returnValue(
        Promise.resolve({
          data: options,
          paging: { currentPage: 1, totalPages: 1 } as never,
          res: FETCH_RES,
        })
      );

      const existing = { category: 'cat', key: 'k1', lastUpdated: '', user: '' };
      const cfg = makeConfig([existing]);

      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(cfg));
      inventoryService.update.and.returnValue(Promise.resolve({ data: cfg, res: FETCH_RES }));

      const rows = await service.allowListOptionsByCategory('cat');

      expect(rows).toHaveSize(1);
      expect(rows[0].id).toBe('cat-k2');

      const updateCall = inventoryService.update.calls.mostRecent().args[0] as {
        options: unknown[];
      };

      expect(updateCall.options).toHaveSize(2);
    });

    it('rejects with a clear error when the category has no tenant options', async () => {
      tenantOptionsService.list.and.returnValue(
        Promise.resolve({
          data: [],
          paging: { currentPage: 1, totalPages: 1 } as never,
          res: FETCH_RES,
        })
      );

      await expectAsync(service.allowListOptionsByCategory('missing-cat')).toBeRejectedWithError(
        'No tenant options found for category "missing-cat"'
      );

      expect(inventoryService.update).not.toHaveBeenCalled();
    });

    it('paginates when totalPages > 1', async () => {
      const page1: ITenantOption[] = [{ category: 'cat', key: 'k1', value: 'v1' }];
      const page2: ITenantOption[] = [{ category: 'cat', key: 'k2', value: 'v2' }];

      tenantOptionsService.list.and.returnValues(
        Promise.resolve({
          data: page1,
          paging: { currentPage: 1, totalPages: 2 } as never,
          res: FETCH_RES,
        }),
        Promise.resolve({
          data: page2,
          paging: { currentPage: 2, totalPages: 2 } as never,
          res: FETCH_RES,
        })
      );

      const cfg = makeConfig();

      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(cfg));
      inventoryService.update.and.returnValue(Promise.resolve({ data: cfg, res: FETCH_RES }));

      const rows = await service.allowListOptionsByCategory('cat');

      expect(rows).toHaveSize(2);
      expect(tenantOptionsService.list).toHaveBeenCalledTimes(2);
    });
  });

  // ─── deleteOption() ──────────────────────────────────────────────────────────

  describe('deleteOption()', () => {
    it('removes the option from the config managed object', async () => {
      const existing = { category: 'cat', key: 'key', lastUpdated: '', user: '' };
      const other = { category: 'other', key: 'key', lastUpdated: '', user: '' };
      const cfg = makeConfig([existing, other]);

      tenantOptionsService.delete.and.returnValue(
        Promise.resolve({ data: null as any, res: FETCH_RES })
      );
      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(cfg));
      inventoryService.update.and.returnValue(Promise.resolve({ data: cfg, res: FETCH_RES }));

      const row = { ...existing } as TenantOptionRow;

      await service.deleteOption(row);

      const updateCall = inventoryService.update.calls.mostRecent().args[0] as {
        options: unknown[];
      };

      expect(updateCall.options).toHaveSize(1);
    });

    it('calls tenantOptionsService.delete with the correct category+key', async () => {
      const cfg = makeConfig([]);

      tenantOptionsService.delete.and.returnValue(
        Promise.resolve({ data: null as any, res: FETCH_RES })
      );
      spyOn(service, 'getConfiguration').and.returnValue(Promise.resolve(cfg));
      inventoryService.update.and.returnValue(Promise.resolve({ data: cfg, res: FETCH_RES }));

      const row = { category: 'cat', key: 'key' } as TenantOptionRow;

      await service.deleteOption(row);

      expect(tenantOptionsService.delete).toHaveBeenCalledWith({ category: 'cat', key: 'key' });
    });
  });
});
