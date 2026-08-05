import { InventoryService } from '@c8y/client';
import { ManagedObjectUpdatePollingService } from './managed-object-update-polling.service';
import { createService } from '~helpers/create-service.helper';

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
      list: jasmine.createSpy('list').and.callFake(() =>
        Promise.resolve({
          data: [{ id: 'mo-1', lastUpdated: '2026-01-01T00:00:01.000Z' }],
        })
      ),
    } as unknown as InventoryService;
    const service = createService(ManagedObjectUpdatePollingService, [
      { provide: InventoryService, useValue: inventory },
    ]);
    const next = jasmine.createSpy('next');

    const sub = service.startListening('type eq x', 1).subscribe(next);

    jasmine.clock().tick(2);
    await Promise.resolve();

    expect(next).toHaveBeenCalledWith([{ id: 'mo-1', lastUpdated: '2026-01-01T00:00:01.000Z' }]);

    service.stopListening();
    sub.unsubscribe();
  });

  it('builds a balanced $filter query from the query extension', async () => {
    const list = jasmine.createSpy('list').and.callFake(() => Promise.resolve({ data: [] }));
    const inventory = { list } as unknown as InventoryService;
    const service = createService(ManagedObjectUpdatePollingService, [
      { provide: InventoryService, useValue: inventory },
    ]);

    const sub = service.startListening('type eq x', 1).subscribe();

    jasmine.clock().tick(2);
    await Promise.resolve();

    const { query } = list.calls.mostRecent().args[0] as { query: string };

    expect(query).toMatch(/^\$filter=\(lastUpdated\.date gt '.+' and type eq x\)$/);
    expect(query.split('(').length).toBe(query.split(')').length);

    service.stopListening();
    sub.unsubscribe();
  });

  it('does not keep polling after stopListening', async () => {
    const list = jasmine.createSpy('list').and.callFake(() => Promise.resolve({ data: [] }));
    const inventory = { list } as unknown as InventoryService;
    const service = createService(ManagedObjectUpdatePollingService, [
      { provide: InventoryService, useValue: inventory },
    ]);

    const sub = service.startListening('type eq x', 1).subscribe();

    jasmine.clock().tick(2);
    await Promise.resolve();
    service.stopListening();

    const callsAfterStop = list.calls.count();

    // The pending timer scheduled by the in-flight request must not dereference
    // the completed loop subject nor trigger another request.
    expect(() => jasmine.clock().tick(50)).not.toThrow();
    expect(list.calls.count()).toBe(callsAfterStop);

    sub.unsubscribe();
  });

  it('returns existing stream when already listening', () => {
    // eslint-disable-next-line @typescript-eslint/require-await
    const inventory = {
      list: jasmine.createSpy('list').and.callFake(() => Promise.resolve({ data: [] })),
    } as unknown as InventoryService;
    const service = createService(ManagedObjectUpdatePollingService, [
      { provide: InventoryService, useValue: inventory },
    ]);

    const stream1 = service.startListening('type eq x', 1);
    const stream2 = service.startListening('type eq x', 1);

    expect(stream2).toBe(stream1);
    service.stopListening();
  });
});
