import { Injectable } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { IManagedObject, InventoryService } from '@c8y/client';
import { MyLayer, QueryLayerConfig } from '../layered-map-widget.model';
import { SourceIdPollingService } from './source-id-polling.service';

/** Concrete subclass so the shared delta logic can be exercised directly. */
@Injectable()
class TestPollingService extends SourceIdPollingService {
  sources = new Set<string>();

  protected fetchMatchingSourceIds(): Promise<Set<string>> {
    return Promise.resolve(this.sources);
  }

  /** Exposes the protected diff for assertions. */
  diff(sources: Set<string>, layer: MyLayer) {
    return this.toPollingDelta(sources, layer);
  }
}

function makeLayer(deviceIds: string[]): MyLayer {
  return {
    devices: [...deviceIds],
    config: { type: 'Alarm' } as QueryLayerConfig,
  } as unknown as MyLayer;
}

function mo(id: string): IManagedObject {
  return { id } as IManagedObject;
}

describe('SourceIdPollingService', () => {
  let list: jasmine.Spy;
  let service: TestPollingService;

  beforeEach(() => {
    list = jasmine
      .createSpy('list')
      .and.callFake(({ ids }: { ids: string }) =>
        Promise.resolve({ data: ids.split(',').map(mo), paging: undefined })
      );
    TestBed.configureTestingModule({
      providers: [TestPollingService, { provide: InventoryService, useValue: { list } }],
    });
    service = TestBed.inject(TestPollingService);
  });

  describe('toPollingDelta()', () => {
    it('adds sources the layer does not have yet', async () => {
      const delta = await service.diff(new Set(['a', 'b']), makeLayer(['a']));

      expect(delta.add.map((m) => m.id)).toEqual(['b']);
      expect(delta.remove).toEqual([]);
    });

    it('removes layer members that no longer match', async () => {
      const delta = await service.diff(new Set(['a']), makeLayer(['a', 'stale']));

      expect(delta.add).toEqual([]);
      expect(delta.remove).toEqual(['stale']);
    });

    it('reports both additions and removals in one delta', async () => {
      const delta = await service.diff(new Set(['new']), makeLayer(['old']));

      expect(delta.add.map((m) => m.id)).toEqual(['new']);
      expect(delta.remove).toEqual(['old']);
    });

    it('produces an empty delta when nothing changed', async () => {
      const delta = await service.diff(new Set(['a', 'b']), makeLayer(['a', 'b']));

      expect(delta.add).toEqual([]);
      expect(delta.remove).toEqual([]);
      // No ids to resolve means no inventory request.
      expect(list).not.toHaveBeenCalled();
    });

    it('does not request the inventory when there is nothing to add', async () => {
      await service.diff(new Set([]), makeLayer(['gone']));

      expect(list).not.toHaveBeenCalled();
    });

    it('resolves only positioned managed objects', async () => {
      await service.diff(new Set(['a']), makeLayer([]));

      expect(list).toHaveBeenCalledWith(
        jasmine.objectContaining({ fragmentType: 'c8y_Position', withChildren: false })
      );
    });
  });

  describe('resolveManagedObjects() paging', () => {
    it('follows nextPage until exhausted for more than one page of ids', async () => {
      const ids = Array.from({ length: 101 }, (_, i) => `id-${i}`);
      const secondPage = { data: [mo('page-2')], paging: undefined };
      const pagingNext = jasmine.createSpy('next').and.returnValue(Promise.resolve(secondPage));

      list.and.returnValue(
        Promise.resolve({ data: [mo('page-1')], paging: { nextPage: 2, next: pagingNext } })
      );

      const delta = await service.diff(new Set(ids), makeLayer([]));

      expect(pagingNext).toHaveBeenCalled();
      expect(delta.add.map((m) => m.id)).toEqual(['page-1', 'page-2']);
    });

    it('requests a single page for up to 100 ids', async () => {
      const ids = Array.from({ length: 100 }, (_, i) => `id-${i}`);

      await service.diff(new Set(ids), makeLayer([]));

      expect(list).toHaveBeenCalledTimes(1);
      expect(list).toHaveBeenCalledWith(jasmine.objectContaining({ withTotalPages: false }));
    });
  });
});
