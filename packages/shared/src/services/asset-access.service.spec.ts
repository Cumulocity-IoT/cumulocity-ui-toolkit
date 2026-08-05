import { firstValueFrom } from 'rxjs';
import { FetchClient, InventoryService, TenantOptionsService } from '@c8y/client';
import { AssetAccessService } from './asset-access.service';
import { createService } from '~helpers/create-service.helper';

/** Builds the service with just the collaborators each test needs. */
function makeService(overrides: {
  fetch?: jasmine.Spy;
  tenantOptionDetail?: jasmine.Spy;
  inventoryDetail?: jasmine.Spy;
  inventoryList?: jasmine.Spy;
}) {
  const fetchClient = {
    fetch: overrides.fetch ?? jasmine.createSpy('fetch'),
  } as unknown as FetchClient;
  const tenantOptionsService = {
    detail: overrides.tenantOptionDetail ?? jasmine.createSpy('detail'),
  } as unknown as TenantOptionsService;
  const inventoryService = {
    detail: overrides.inventoryDetail ?? jasmine.createSpy('detail'),
    list: overrides.inventoryList ?? jasmine.createSpy('list'),
  } as unknown as InventoryService;

  return createService(AssetAccessService, [
    { provide: FetchClient, useValue: fetchClient },
    { provide: TenantOptionsService, useValue: tenantOptionsService },
    { provide: InventoryService, useValue: inventoryService },
  ]);
}

/** A rejection shaped like an @c8y/client failure, which carries `res.status`. */
function httpError(status: number): Error & { res: { status: number } } {
  return Object.assign(new Error(`HTTP ${status}`), { res: { status } });
}

function jsonResponse(body: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(body) } as Response);
}

describe('AssetAccessService', () => {
  describe('custom-endpoint', () => {
    it('returns a plain id array', async () => {
      const fetch = jasmine.createSpy('fetch').and.returnValue(jsonResponse(['a', 'b']));
      const service = makeService({ fetch });

      const ids = await service.getAssetIdsFromConfigAsync({
        method: 'custom-endpoint',
        endpoint: '/service/ids',
      });

      expect(ids).toEqual(['a', 'b']);
    });

    it('unwraps an assetIds payload', async () => {
      const fetch = jasmine.createSpy('fetch').and.returnValue(jsonResponse({ assetIds: ['x'] }));
      const service = makeService({ fetch });

      expect(
        await service.getAssetIdsFromConfigAsync({
          method: 'custom-endpoint',
          endpoint: '/service/ids',
        })
      ).toEqual(['x']);
    });

    /**
     * The service used to map every failure to an empty array, so callers could not
     * tell "this user has no assets" apart from "the request failed".
     */
    it('propagates a non-ok response instead of returning an empty list', async () => {
      const fetch = jasmine
        .createSpy('fetch')
        .and.returnValue(Promise.resolve({ ok: false, status: 500 } as Response));
      const service = makeService({ fetch });

      await expectAsync(
        service.getAssetIdsFromConfigAsync({ method: 'custom-endpoint', endpoint: '/service/ids' })
      ).toBeRejected();
    });

    it('returns an empty list when no endpoint is configured', async () => {
      const service = makeService({});

      expect(await service.getAssetIdsFromConfigAsync({ method: 'custom-endpoint' })).toEqual([]);
    });
  });

  describe('inventory-query', () => {
    it('maps managed objects to their ids', async () => {
      const list = jasmine
        .createSpy('list')
        .and.returnValue(Promise.resolve({ data: [{ id: '1' }, { id: '2' }] }));
      const service = makeService({ inventoryList: list });

      expect(
        await service.getAssetIdsFromConfigAsync({ method: 'inventory-query', query: '$filter=x' })
      ).toEqual(['1', '2']);
    });

    it('propagates query failures', async () => {
      const list = jasmine.createSpy('list').and.returnValue(Promise.reject(new Error('403')));
      const service = makeService({ inventoryList: list });

      await expectAsync(
        service.getAssetIdsFromConfigAsync({ method: 'inventory-query', query: '$filter=x' })
      ).toBeRejected();
    });
  });

  describe('managed-object', () => {
    it('reads ids from the default fragment', async () => {
      const detail = jasmine
        .createSpy('detail')
        .and.returnValue(Promise.resolve({ data: { assetIds: ['m1'] } }));
      const service = makeService({ inventoryDetail: detail });

      expect(
        await service.getAssetIdsFromConfigAsync({ method: 'managed-object', managedObjectId: '7' })
      ).toEqual(['m1']);
    });

    it('reads ids from a nested fragment path', async () => {
      const detail = jasmine
        .createSpy('detail')
        .and.returnValue(Promise.resolve({ data: { custom: { list: ['m2'] } } }));
      const service = makeService({ inventoryDetail: detail });

      expect(
        await service.getAssetIdsFromConfigAsync({
          method: 'managed-object',
          managedObjectId: '7',
          fragment: 'custom.list',
        })
      ).toEqual(['m2']);
    });

    it('returns an empty list when the fragment is absent', async () => {
      const detail = jasmine.createSpy('detail').and.returnValue(Promise.resolve({ data: {} }));
      const service = makeService({ inventoryDetail: detail });

      expect(
        await service.getAssetIdsFromConfigAsync({ method: 'managed-object', managedObjectId: '7' })
      ).toEqual([]);
    });
  });

  describe('unknown method', () => {
    it('rejects rather than silently resolving to no assets', async () => {
      const service = makeService({});

      await expectAsync(
        service.getAssetIdsFromConfigAsync({ method: 'nope' as never })
      ).toBeRejected();
    });
  });

  describe('config loading', () => {
    it('treats a missing tenant option as "no filter configured"', async () => {
      const tenantOptionDetail = jasmine
        .createSpy('detail')
        .and.returnValue(Promise.reject(httpError(404)));
      const service = makeService({ tenantOptionDetail });

      expect(await service.getAssetIdsAsync('cat', 'key')).toEqual([]);
    });

    it('propagates non-404 tenant option failures', async () => {
      const tenantOptionDetail = jasmine
        .createSpy('detail')
        .and.returnValue(Promise.reject(httpError(500)));
      const service = makeService({ tenantOptionDetail });

      await expectAsync(service.getAssetIdsAsync('cat', 'key')).toBeRejected();
    });

    it('rejects on a malformed option instead of resolving to no assets', async () => {
      const tenantOptionDetail = jasmine
        .createSpy('detail')
        .and.returnValue(Promise.resolve({ data: { value: '{ not json' } }));
      const service = makeService({ tenantOptionDetail });

      await expectAsync(service.getAssetIdsAsync('cat', 'key')).toBeRejected();
    });
  });

  describe('caching', () => {
    it('serves repeated calls from the cache', async () => {
      const list = jasmine
        .createSpy('list')
        .and.returnValue(Promise.resolve({ data: [{ id: '1' }] }));
      const service = makeService({ inventoryList: list });
      const config = { method: 'inventory-query' as const, query: '$filter=x' };

      await service.getAssetIdsFromConfigAsync(config);
      await service.getAssetIdsFromConfigAsync(config);

      expect(list).toHaveBeenCalledTimes(1);
    });

    it('re-requests after the cache is cleared', async () => {
      const list = jasmine
        .createSpy('list')
        .and.returnValue(Promise.resolve({ data: [{ id: '1' }] }));
      const service = makeService({ inventoryList: list });
      const config = { method: 'inventory-query' as const, query: '$filter=x' };

      await service.getAssetIdsFromConfigAsync(config);
      service.refreshCache();
      await service.getAssetIdsFromConfigAsync(config);

      expect(list).toHaveBeenCalledTimes(2);
    });

    /** Failures must not be cached, or one blip would persist for the whole TTL. */
    it('does not cache failures', async () => {
      const list = jasmine
        .createSpy('list')
        .and.returnValues(
          Promise.reject(new Error('boom')),
          Promise.resolve({ data: [{ id: '1' }] })
        );
      const service = makeService({ inventoryList: list });
      const config = { method: 'inventory-query' as const, query: '$filter=x' };

      await expectAsync(service.getAssetIdsFromConfigAsync(config)).toBeRejected();
      expect(await service.getAssetIdsFromConfigAsync(config)).toEqual(['1']);
    });
  });

  it('exposes the observable API alongside the promise API', async () => {
    const list = jasmine
      .createSpy('list')
      .and.returnValue(Promise.resolve({ data: [{ id: '9' }] }));
    const service = makeService({ inventoryList: list });

    const ids = await firstValueFrom(
      service.getAssetIdsFromConfig({ method: 'inventory-query', query: '$filter=x' })
    );

    expect(ids).toEqual(['9']);
  });
});
