import { DataGridComponent } from '@c8y/ngx-components';
import { DataGridPatchService } from './data-grid-patch.service';

describe('DataGridPatchService', () => {
  let service: DataGridPatchService;

  beforeEach(() => {
    service = new DataGridPatchService();
  });

  it('patches changeSortOrder to enforce single column sorting', () => {
    const originalSort = jasmine.createSpy('changeSortOrder');
    const grid = {
      columns: [
        { name: 'name', sortable: true, sortOrder: 'asc' },
        { name: 'status', sortable: true, sortOrder: 'desc' },
      ],
      changeSortOrder: originalSort,
    } as unknown as DataGridComponent;

    service.applySingleSortBehavior(grid);
    (grid as unknown as { changeSortOrder: (col: string) => void }).changeSortOrder('name');

    expect((grid as unknown as { columns: { sortOrder: string }[] }).columns[1].sortOrder).toBe('');
    expect(originalSort).toHaveBeenCalledWith('name');
  });

  it('does not patch twice when backup method already exists', () => {
    const grid = {
      columns: [],
      changeSortOrder: jasmine.createSpy('changeSortOrder'),
      multiSortMethod: jasmine.createSpy('multiSortMethod'),
    } as unknown as DataGridComponent;

    service.applySingleSortBehavior(grid);

    expect(
      (grid as unknown as { changeSortOrder: jasmine.Spy }).changeSortOrder
    ).not.toHaveBeenCalled();
  });

  it('throws when changeSortOrder is missing', () => {
    const grid = { columns: [] } as unknown as DataGridComponent;

    expect(() => service.applySingleSortBehavior(grid)).toThrowError(
      /Patching of c8y-data-grid failed/
    );
  });

  it('does not patch an already patched grid', () => {
    const changeSortOrder = jasmine.createSpy('changeSortOrder');
    const grid = {
      columns: [],
      changeSortOrder,
      multiSortMethod: jasmine.createSpy('multiSortMethod'),
    } as never;

    service.applySingleSortBehavior(grid);

    expect((grid as unknown as { changeSortOrder: jasmine.Spy }).changeSortOrder).toBe(
      changeSortOrder
    );
  });

  it('resets other sorted columns and invokes original method', () => {
    const original = jasmine.createSpy('changeSortOrder');
    const grid = {
      columns: [
        { name: 'a', sortable: true, sortOrder: 'asc' },
        { name: 'b', sortable: true, sortOrder: 'desc' },
        { name: 'c', sortable: false, sortOrder: 'asc' },
      ],
      changeSortOrder: original,
    };

    service.applySingleSortBehavior(grid as never);
    grid.changeSortOrder('a');

    expect(grid.columns[1].sortOrder).toBe('');
    expect(grid.columns[2].sortOrder).toBe('asc');
    expect(original).toHaveBeenCalledWith('a');
  });
});
