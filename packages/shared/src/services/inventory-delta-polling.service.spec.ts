import { InventoryService } from '@c8y/client';
import { InventoryDeltaPollingService } from './inventory-delta-polling.service';
import { createService } from '~helpers/create-service.helper';

describe('InventoryDeltaPollingService', () => {
  afterEach(() => {
    jasmine.clock().uninstall();
  });

  it('creates add and remove deltas correctly', () => {
    const service = createService(InventoryDeltaPollingService, [
      { provide: InventoryService, useValue: {} as InventoryService },
    ]);

    const delta = service.toDelta([{ id: 'a' } as any, { id: 'c' } as any], ['a', 'b']);

    expect(delta.add.map((m) => m.id)).toEqual(['c']);
    expect(delta.remove).toEqual(['b']);
  });

  it('emits only when there is a non-empty delta', async () => {
    jasmine.clock().install();
    const service = createService(InventoryDeltaPollingService, [
      { provide: InventoryService, useValue: {} as InventoryService },
    ]);
    const checkSpy: any = spyOn(service as any, 'checkForUpdates').and.returnValues(
      Promise.resolve({ add: [], remove: [] }),
      Promise.resolve({ add: [{ id: 'new-1' }], remove: [] })
    );
    const next = jasmine.createSpy('next');

    const sub = service.createPolling$({}, 10, []).subscribe(next);

    jasmine.clock().tick(10);
    await Promise.resolve();
    jasmine.clock().tick(10);
    await Promise.resolve();

    expect(checkSpy).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith({ add: [{ id: 'new-1' }], remove: [] });

    sub.unsubscribe();
  });
});
