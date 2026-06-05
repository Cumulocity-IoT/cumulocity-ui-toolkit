import { InventoryService } from '@c8y/client';
import { firstValueFrom, of } from 'rxjs';
import { HierarchyAggregationService } from './hierarchy-aggregate.service';

describe('HierarchyAggregationService', () => {
  it('emits an initial empty result immediately', async () => {
    const list = jest.fn().mockResolvedValue({ data: [] });
    const service = new HierarchyAggregationService({ list } as unknown as InventoryService);

    const result = await firstValueFrom(service.getAllChildrenOfManagedObject$('root'));

    expect(result).toEqual([]);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ query: '$filter=(bygroupid(root))' })
    );
  });

  it('reuses direct children cache when enabled', async () => {
    const list = jest.fn().mockResolvedValue({ data: [] });
    const service = new HierarchyAggregationService({ list } as unknown as InventoryService);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    await firstValueFrom((service as any).getDirectChildrenOfManagedObject$('cached', true));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    await firstValueFrom((service as any).getDirectChildrenOfManagedObject$('cached', true));

    expect(list).toHaveBeenCalledTimes(1);
  });

  it('maps and deduplicates extracted attribute values', async () => {
    const service = new HierarchyAggregationService({
      list: jest.fn(),
    } as unknown as InventoryService);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    jest.spyOn(service, 'getAllChildrenOfManagedObject$').mockReturnValue(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
      of(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
        [
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: '1', type: 'A' } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: '2', type: 'A' } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { id: '3', type: 'B' } as any,
        ] as any // eslint-disable-line @typescript-eslint/no-explicit-any
      )
    );

    const values = await firstValueFrom(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      service.getUniqAttributeValueOfAllChildren$((mo) => (mo as any).type as string, 'root')
    );

    expect(values).toEqual(['A', 'B']);
  });
});
