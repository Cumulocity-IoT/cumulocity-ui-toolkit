import { IManagedObject, InventoryService } from '@c8y/client';
import { filter, firstValueFrom, of } from 'rxjs';
import { HierarchyAggregationService } from './hierarchy-aggregation.service';
import { createService } from '~helpers/create-service.helper';

/** Builds a managed object with the child counts `withChildrenCount` would return. */
function mo(id: string, counts: { assets?: number; devices?: number; additions?: number } = {}) {
  return {
    id,
    childAssets: { count: counts.assets ?? 0 },
    childDevices: { count: counts.devices ?? 0 },
    childAdditions: { count: counts.additions ?? 0 },
  } as unknown as IManagedObject;
}

/** Resolves the first non-empty emission, skipping the `startWith([])` seed. */
function firstResult(
  source: ReturnType<HierarchyAggregationService['getAllChildrenOfManagedObject$']>
) {
  return firstValueFrom(source.pipe(filter((children) => children.length > 0)));
}

describe('HierarchyAggregationService', () => {
  it('emits an initial empty result immediately', async () => {
    const list = jasmine.createSpy('list').and.returnValue(Promise.resolve({ data: [] }));
    const service = createService(HierarchyAggregationService, [
      { provide: InventoryService, useValue: { list } },
    ]);

    const result = await firstValueFrom(service.getAllChildrenOfManagedObject$('root'));

    expect(result).toEqual([]);
    expect(list).toHaveBeenCalledWith(
      jasmine.objectContaining({ query: '$filter=(bygroupid(root))' })
    );
  });

  it('emits direct children when none of them has children of its own', async () => {
    const list = jasmine
      .createSpy('list')
      .and.returnValue(Promise.resolve({ data: [mo('leaf-1'), mo('leaf-2')] }));
    const service = createService(HierarchyAggregationService, [
      { provide: InventoryService, useValue: { list } },
    ]);

    const result = await firstResult(service.getAllChildrenOfManagedObject$('root'));

    expect(result.map((child) => child.id)).toEqual(['leaf-1', 'leaf-2']);
  });

  it('emits direct and nested children deduplicated by id', async () => {
    const list = jasmine.createSpy('list').and.callFake(({ query }: { query: string }) => {
      if (query.includes('root')) {
        return Promise.resolve({ data: [mo('group-1', { assets: 1 }), mo('leaf-1')] });
      }

      if (query.includes('group-1')) {
        return Promise.resolve({ data: [mo('leaf-2'), mo('leaf-1')] });
      }

      return Promise.resolve({ data: [] });
    });
    const service = createService(HierarchyAggregationService, [
      { provide: InventoryService, useValue: { list } },
    ]);

    const result = await firstValueFrom(
      service.getAllChildrenOfManagedObject$('root').pipe(filter((children) => children.length > 2))
    );

    expect(result.map((child) => child.id)).toEqual(['group-1', 'leaf-1', 'leaf-2']);
  });

  it('treats managed objects without child count fragments as leaves', async () => {
    const list = jasmine
      .createSpy('list')
      .and.returnValue(Promise.resolve({ data: [{ id: 'no-fragments' } as IManagedObject] }));
    const service = createService(HierarchyAggregationService, [
      { provide: InventoryService, useValue: { list } },
    ]);

    const result = await firstResult(service.getAllChildrenOfManagedObject$('root'));

    expect(result.map((child) => child.id)).toEqual(['no-fragments']);
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('reuses direct children cache when enabled', async () => {
    const list = jasmine.createSpy('list').and.returnValue(Promise.resolve({ data: [] }));
    const service = createService(HierarchyAggregationService, [
      { provide: InventoryService, useValue: { list } },
    ]);

    await firstValueFrom((service as any).getDirectChildrenOfManagedObject$('cached', true));
    await firstValueFrom((service as any).getDirectChildrenOfManagedObject$('cached', true));

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('maps and deduplicates extracted attribute values', async () => {
    const service = createService(HierarchyAggregationService, [
      {
        provide: InventoryService,
        useValue: {
          list: jasmine.createSpy('list'),
        },
      },
    ]);

    spyOn(service, 'getAllChildrenOfManagedObject$').and.returnValue(
      of([
        { id: '1', type: 'A' } as any,
        { id: '2', type: 'A' } as any,
        { id: '3', type: 'B' } as any,
      ] as any)
    );

    const values = await firstValueFrom(
      service.getUniqAttributeValueOfAllChildren$((mo) => (mo as any).type as string, 'root')
    );

    expect(values).toEqual(['A', 'B']);
  });
});
