import { InventoryService } from '@c8y/client';

import { ManagedObjectUpdatePollingService } from './managed-object-update-detection.service';

describe('ManagedObjectUpdatePollingService', () => {
  beforeEach(() => {
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('emits updates when managed objects are returned', async () => {
    const inventory = {
      // eslint-disable-next-line @typescript-eslint/require-await
      list: jasmine.createSpy('list').and.callFake(async () => ({
        data: [{ id: 'mo-1', lastUpdated: '2026-01-01T00:00:01.000Z' }],
      })),
    } as unknown as InventoryService;
    const service = new ManagedObjectUpdatePollingService(inventory);
    const next = jasmine.createSpy('next');

    const sub = service.startListening('type eq x', 1).subscribe(next);

    jasmine.clock().tick(2);
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith([{ id: 'mo-1', lastUpdated: '2026-01-01T00:00:01.000Z' }]);

    service.stopListening();
    sub.unsubscribe();
  });

  it('returns existing stream when already listening', () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const inventory = { list: jasmine.createSpy('list').and.callFake(async () => ({ data: [] })) } as unknown as InventoryService;
    const service = new ManagedObjectUpdatePollingService(inventory);

    const stream1 = service.startListening('type eq x', 1);
    const stream2 = service.startListening('type eq x', 1);

    expect(stream2).toBe(stream1);
    service.stopListening();
  });
});
