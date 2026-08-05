import { TestBed } from '@angular/core/testing';
import { DataGridComponent, DataGridService } from '@c8y/ngx-components';
import { Column, ColumnConfig, GridConfig } from '@c8y/ngx-components';
import { Subject, of } from 'rxjs';
import { provideMock } from '../helpers/auto-mock.helper';
import {
  ExtendedColumnConfig,
  GridColumnWidthService,
  isExtendedColumnConfig,
} from './grid-column-width.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeColumn(name: string, gridTrackSize: string, positionFixed = false): Column {
  return { name, gridTrackSize, positionFixed, visible: true };
}

function makeStoredConfig(columns: ColumnConfig[]): GridConfig {
  return { columns, pagination: { pageSize: 25 } };
}

function makeGrid(columns: Column[] = [makeColumn('name', '200px'), makeColumn('type', '150px')]) {
  let currentColumns = ([] as Column[]).concat(columns);
  const configurationStrategy = {
    getConfig$: jasmine.createSpy('getConfig$').and.returnValue(of(makeStoredConfig([]))),
    saveConfig$: jasmine.createSpy('saveConfig$').and.returnValue(of(undefined)),
    getContext: jasmine.createSpy('getContext'),
    isContextKnown: jasmine.createSpy('isContextKnown').and.returnValue(true),
  };

  const grid = {
    get columns() {
      return currentColumns;
    },
    set columns(val) {
      currentColumns = val;
    },
    get pagination() {
      return { pageSize: 25 };
    },
    resizeHandleMouseDown$: new Subject<{ event: MouseEvent; targetColumnName: string }>(),
    windowMouseUp$: new Subject<MouseEvent>(),
    configurationStrategy,
  } as unknown as DataGridComponent;

  return grid;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GridColumnWidthService', () => {
  let service: GridColumnWidthService;
  let dataGridService: DataGridService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [GridColumnWidthService, provideMock(DataGridService)],
    });

    service = TestBed.inject(GridColumnWidthService);
    dataGridService = TestBed.inject(DataGridService);

    // Provide a no-op default for applyConfigToColumns.
    (dataGridService.applyConfigToColumns as jasmine.Spy).and.callFake((_, cols: Column[]) =>
      ([] as Column[]).concat(cols)
    );
  });

  // -------------------------------------------------------------------------
  // applyConfigToColumns patch (load/restore side)
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // isExtendedColumnConfig type guard
  // -------------------------------------------------------------------------

  describe('isExtendedColumnConfig', () => {
    it('returns true when gridTrackSize is a string', () => {
      const col: ExtendedColumnConfig = { name: 'name', gridTrackSize: '200px' };

      expect(isExtendedColumnConfig(col)).toBe(true);
    });

    it('returns false when gridTrackSize is absent', () => {
      expect(isExtendedColumnConfig({ name: 'name', visible: true })).toBe(false);
    });

    it('returns false when gridTrackSize is not a string (e.g. number from malformed storage)', () => {
      const col = { name: 'name', gridTrackSize: 200 } as unknown as ColumnConfig;

      expect(isExtendedColumnConfig(col)).toBe(false);
    });
  });

  describe('patching DataGridService.applyConfigToColumns', () => {
    it('restores gridTrackSize from an ExtendedColumnConfig onto the matching live column', () => {
      const destroy$ = new Subject<void>();
      const grid = makeGrid();

      service.applyColumnWidthPersistence(grid, destroy$.asObservable());

      const storedColumns: ExtendedColumnConfig[] = [
        { name: 'name', visible: true, gridTrackSize: '350px' },
        { name: 'type', visible: true, gridTrackSize: '280px' },
      ];
      const inputColumns = [makeColumn('name', '200px'), makeColumn('type', '150px')];

      // Invoke the patched method directly.
      const result = dataGridService.applyConfigToColumns(
        makeStoredConfig(storedColumns),
        inputColumns
      );

      expect(result.find((c) => c.name === 'name')?.gridTrackSize).toBe('350px');
      expect(result.find((c) => c.name === 'type')?.gridTrackSize).toBe('280px');
      destroy$.next();
    });

    it('leaves columns unchanged when the stored config has no gridTrackSize', () => {
      const destroy$ = new Subject<void>();
      const grid = makeGrid();

      service.applyColumnWidthPersistence(grid, destroy$.asObservable());

      const storedColumns: ColumnConfig[] = [
        { name: 'name', visible: true },
        { name: 'type', visible: true },
      ];
      const inputColumns = [makeColumn('name', '200px'), makeColumn('type', '150px')];

      const result = dataGridService.applyConfigToColumns(
        makeStoredConfig(storedColumns),
        inputColumns
      );

      expect(result.find((c) => c.name === 'name')?.gridTrackSize).toBe('200px');
      expect(result.find((c) => c.name === 'type')?.gridTrackSize).toBe('150px');
      destroy$.next();
    });

    it('does not double-patch DataGridService across multiple grid instances', () => {
      const d1$ = new Subject<void>();
      const d2$ = new Subject<void>();

      service.applyColumnWidthPersistence(makeGrid(), d1$.asObservable());
      const patchedFn = dataGridService.applyConfigToColumns;

      service.applyColumnWidthPersistence(makeGrid(), d2$.asObservable());

      expect(dataGridService.applyConfigToColumns).toBe(patchedFn);
      d1$.next();
      d2$.next();
    });
  });

  // -------------------------------------------------------------------------
  // Resize save (save side)
  // -------------------------------------------------------------------------

  describe('saving widths after resize', () => {
    beforeEach(() => {
      // Run the deferred frame synchronously so the save pipeline completes inline.
      spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => {
        cb(0);

        return 0;
      });
    });

    function simulateResize(grid: DataGridComponent, finalColumns: Column[]) {
      (grid.resizeHandleMouseDown$ as Subject<any>).next({
        event: {} as MouseEvent,
        targetColumnName: finalColumns[0].name,
      });
      grid.columns = finalColumns;
      (grid.windowMouseUp$ as Subject<MouseEvent>).next({} as MouseEvent);
    }

    it('loads the stored config, merges current widths, and saves via configurationStrategy', () => {
      const grid = makeGrid();
      const storedConfig = makeStoredConfig([
        { name: 'name', visible: true },
        { name: 'type', visible: true },
      ]);

      (grid.configurationStrategy.getConfig$ as jasmine.Spy).and.returnValue(of(storedConfig));
      const destroy$ = new Subject<void>();

      service.applyColumnWidthPersistence(grid, destroy$.asObservable());

      simulateResize(grid, [makeColumn('name', '380px'), makeColumn('type', '150px')]);

      expect(grid.configurationStrategy.saveConfig$).toHaveBeenCalledWith(
        jasmine.objectContaining({
          columns: jasmine.arrayContaining([
            jasmine.objectContaining({ name: 'name', gridTrackSize: '380px' }),
            jasmine.objectContaining({ name: 'type', gridTrackSize: '150px' }),
          ]),
        })
      );
      destroy$.next();
    });

    it('preserves existing ColumnConfig fields (visible, sortOrder, filter) when merging widths', () => {
      const grid = makeGrid();
      const storedConfig = makeStoredConfig([
        { name: 'name', visible: false, sortOrder: 'asc' },
        { name: 'type', visible: true },
      ]);

      (grid.configurationStrategy.getConfig$ as jasmine.Spy).and.returnValue(of(storedConfig));
      const destroy$ = new Subject<void>();

      service.applyColumnWidthPersistence(grid, destroy$.asObservable());
      simulateResize(grid, [makeColumn('name', '300px'), makeColumn('type', '150px')]);

      const savedConfig = (grid.configurationStrategy.saveConfig$ as jasmine.Spy).calls.argsFor(
        0
      )[0] as GridConfig;
      const nameCol = savedConfig.columns.find((c) => c.name === 'name') as ExtendedColumnConfig;

      expect(nameCol.visible).toBe(false);
      expect(nameCol.sortOrder).toBe('asc');
      expect(nameCol.gridTrackSize).toBe('300px');
      destroy$.next();
    });

    it('excludes positionFixed columns (checkbox, actions) from saved widths', () => {
      const grid = makeGrid([
        makeColumn('name', '200px'),
        makeColumn('checkbox', '32px', /* positionFixed */ true),
      ]);
      const storedConfig = makeStoredConfig([{ name: 'name', visible: true }]);

      (grid.configurationStrategy.getConfig$ as jasmine.Spy).and.returnValue(of(storedConfig));
      const destroy$ = new Subject<void>();

      service.applyColumnWidthPersistence(grid, destroy$.asObservable());
      simulateResize(grid, [makeColumn('name', '400px'), makeColumn('checkbox', '32px', true)]);

      const savedConfig = (grid.configurationStrategy.saveConfig$ as jasmine.Spy).calls.argsFor(
        0
      )[0] as GridConfig;
      const checkboxCol = savedConfig.columns.find((c) => c.name === 'checkbox');

      expect(checkboxCol).toBeUndefined(); // not in storedConfig.columns → not in merged output either
      destroy$.next();
    });

    it('does NOT save when windowMouseUp$ fires without a prior resizeHandleMouseDown$', () => {
      const grid = makeGrid();
      const destroy$ = new Subject<void>();

      service.applyColumnWidthPersistence(grid, destroy$.asObservable());

      (grid.windowMouseUp$ as Subject<MouseEvent>).next({} as MouseEvent);

      expect(grid.configurationStrategy.saveConfig$).not.toHaveBeenCalled();
      destroy$.next();
    });

    it('is a no-op when no configurationStrategy is provided', () => {
      const grid = makeGrid();

      (grid as any).configurationStrategy = undefined;

      // Should not throw.
      expect(() =>
        service.applyColumnWidthPersistence(grid, new Subject<void>().asObservable())
      ).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Guard / error throwing for missing private API
  // -------------------------------------------------------------------------

  describe('throwing when expected private API is missing', () => {
    it('throws when DataGridService.applyConfigToColumns is not found', () => {
      delete (dataGridService as any).applyConfigToColumns;

      expect(() =>
        service.applyColumnWidthPersistence(makeGrid(), new Subject<void>().asObservable())
      ).toThrowError(/DataGridService\.applyConfigToColumns not found/);
    });

    it('throws when DataGridComponent.resizeHandleMouseDown$ is not found', () => {
      const grid = makeGrid();

      delete (grid as any).resizeHandleMouseDown$;

      expect(() =>
        service.applyColumnWidthPersistence(grid, new Subject<void>().asObservable())
      ).toThrowError(/DataGridComponent\.resizeHandleMouseDown\$ not found/);
    });

    it('throws when DataGridComponent.windowMouseUp$ is not found', () => {
      const grid = makeGrid();

      delete (grid as any).windowMouseUp$;

      expect(() =>
        service.applyColumnWidthPersistence(grid, new Subject<void>().asObservable())
      ).toThrowError(/DataGridComponent\.windowMouseUp\$ not found/);
    });
  });

  // -------------------------------------------------------------------------
  // Teardown
  // -------------------------------------------------------------------------

  describe('cleanup via until$', () => {
    beforeEach(() => {
      // Run the deferred frame synchronously so the save pipeline completes inline.
      spyOn(window, 'requestAnimationFrame').and.callFake((cb: FrameRequestCallback) => {
        cb(0);

        return 0;
      });
    });

    it('stops listening to resize events after until$ emits', () => {
      const grid = makeGrid();
      const destroy$ = new Subject<void>();

      service.applyColumnWidthPersistence(grid, destroy$.asObservable());
      destroy$.next();

      (grid.resizeHandleMouseDown$ as Subject<any>).next({
        event: {} as MouseEvent,
        targetColumnName: 'name',
      });
      (grid.windowMouseUp$ as Subject<MouseEvent>).next({} as MouseEvent);

      expect(grid.configurationStrategy.saveConfig$).not.toHaveBeenCalled();
    });
  });
});
