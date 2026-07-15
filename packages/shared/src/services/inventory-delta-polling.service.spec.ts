import { InventoryService } from '@c8y/client';
import { InventoryDeltaPollingService } from './inventory-delta-polling.service';

describe('InventoryDeltaPollingService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('creates add and remove deltas correctly', () => {
    const service = new InventoryDeltaPollingService({} as InventoryService);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const delta = service.toDelta([{ id: 'a' } as any, { id: 'c' } as any], ['a', 'b']);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
    expect(delta.add.map((m) => m.id)).toEqual(['c']);
    expect(delta.remove).toEqual(['b']);
  });

  it('emits only when there is a non-empty delta', async () => {
    jest.useFakeTimers();
    const service = new InventoryDeltaPollingService({} as InventoryService);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const checkSpy: any = jest
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .spyOn(service as any, 'checkForUpdates')
      .mockResolvedValueOnce({ add: [], remove: [] })
      .mockResolvedValueOnce({ add: [{ id: 'new-1' }], remove: [] });
    const next = jest.fn();

    const sub = service.createPolling$({}, 10, []).subscribe(next);

    jest.advanceTimersByTime(10);
    await Promise.resolve();
    jest.advanceTimersByTime(10);
    await Promise.resolve();

    expect(checkSpy).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith({ add: [{ id: 'new-1' }], remove: [] });

    sub.unsubscribe();
  });
});
