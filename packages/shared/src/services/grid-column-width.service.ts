import { Injectable } from '@angular/core';
import { DataGridComponent, DataGridService } from '@c8y/ngx-components';
import { ColumnConfig } from '@c8y/ngx-components';
import { has, set } from 'lodash';
import { Observable } from 'rxjs';
import { mergeMap, switchMap, take, takeUntil } from 'rxjs/operators';

/**
 * Extends the built-in `ColumnConfig` with an optional `gridTrackSize` field.
 *
 * Because `DataGridService.saveConfig$` serialises the entire config object as-is,
 * any extra fields on a `ColumnConfig` entry are persisted automatically.
 * This type makes that extension explicit and type-safe.
 */
export interface ExtendedColumnConfig extends ColumnConfig {
  gridTrackSize?: string;
}

/**
 * Type guard that narrows a `ColumnConfig` to `ExtendedColumnConfig`.
 * Returns `true` when the entry carries a non-empty `gridTrackSize` string,
 * i.e. when column-width data was previously persisted for this column.
 */
export function isExtendedColumnConfig(col: ColumnConfig): col is ExtendedColumnConfig {
  return 'gridTrackSize' in col && typeof (col as ExtendedColumnConfig).gridTrackSize === 'string';
}

/**
 * Extends the built-in data grid column configuration (visibility + order) with
 * column **width** persistence.
 *
 * ### How it works
 *
 * **Saving** – When the user finishes resizing a column the service
 * (1) loads the latest `GridConfig` from the grid's own `configurationStrategy`,
 * (2) merges the current `gridTrackSize` values from the live columns into the
 * `ColumnConfig` entries as `ExtendedColumnConfig`, and
 * (3) calls `configurationStrategy.saveConfig$` with the enriched config.
 * No separate storage key is needed; width data lives alongside the existing
 * order/visibility data under the same strategy key.
 *
 * **Restoring** – `DataGridService.applyConfigToColumns` is monkey-patched once
 * (globally, idempotent) to also copy `gridTrackSize` from each saved
 * `ExtendedColumnConfig` back onto the live `Column`.  Every grid that uses the
 * same `DataGridService` instance benefits automatically.
 *
 * **Resize detection** – mirrors the internal `resizeHandleDrag$` pattern:
 * `resizeHandleMouseDown$` → `mergeMap` → `resizeHandleContainerMouseUp$.pipe(take(1))`
 * → one `requestAnimationFrame` defer (so the grid's own rAF callback that
 * writes the final `gridTrackSize` has run before we read the values).
 *
 * ### Usage
 *
 * Call once from a `@ViewChild` setter after the grid instance is available.
 * The grid must have a `DATA_GRID_CONFIGURATION_STRATEGY` provided; without
 * one there is nothing to save to and the service is a no-op.
 *
 * ```typescript
 * private destroy$ = new Subject<void>();
 *
 * @ViewChild(DataGridComponent, { static: false })
 * set grid(grid: DataGridComponent) {
 *   if (grid) {
 *     this.gridColumnWidthService.applyColumnWidthPersistence(
 *       grid,
 *       this.destroy$.asObservable()
 *     );
 *   }
 * }
 *
 * ngOnDestroy(): void {
 *   this.destroy$.next();
 *   this.destroy$.complete();
 * }
 * ```
 *
 * WARNING: This service accesses public-but-undocumented properties of
 * `DataGridComponent` (`resizeHandleMouseDown$`, `resizeHandleContainerMouseUp$`,
 * `configurationStrategy`) and monkey-patches `DataGridService.applyConfigToColumns`.
 * It may break in future versions of `@c8y/ngx-components`.
 */
@Injectable({ providedIn: 'root' })
export class GridColumnWidthService {
  /** Marker placed on `DataGridService` to prevent double-patching. */
  private readonly PATCH_MARKER = '__c8yGridColumnWidthPatched';

  constructor(private dataGridService: DataGridService) {}

  /**
   * Enables column-width persistence for the given `DataGridComponent`.
   *
   * @param grid    The `DataGridComponent` instance obtained via `@ViewChild`.
   * @param until$  Observable whose first emission unsubscribes all internal
   *                listeners.  Pass your component's `destroy$` subject.
   */
  applyColumnWidthPersistence(grid: DataGridComponent, until$: Observable<void>): void {
    this.patchApplyConfigToColumns();
    this.setupResizeSave(grid, until$);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Monkey-patches `DataGridService.applyConfigToColumns` so that a saved
   * `gridTrackSize` value on an `ExtendedColumnConfig` is copied back onto the
   * live `Column` after the standard visibility/order/filter restoration.
   *
   * The patch is idempotent – subsequent calls are no-ops.
   * Because `DataGridService` is `providedIn: 'root'`, this patch applies to
   * every grid in the application, but it is purely additive: columns without
   * a saved `gridTrackSize` are unaffected.
   */
  private patchApplyConfigToColumns(): void {
    if (has(this.dataGridService, this.PATCH_MARKER)) {
      return;
    }

    if (!has(this.dataGridService, 'applyConfigToColumns')) {
      throw new Error(
        'GridColumnWidthService: patching failed. ' +
          'DataGridService.applyConfigToColumns not found.'
      );
    }

    set(this.dataGridService, this.PATCH_MARKER, true);

    const original = this.dataGridService.applyConfigToColumns.bind(this.dataGridService);

    this.dataGridService.applyConfigToColumns = (config, columns, storageKey?) => {
      const result = original(config, columns, storageKey);

      config?.columns?.forEach((savedCol) => {
        if (isExtendedColumnConfig(savedCol)) {
          const col = result.find((c) => c.name === savedCol.name);

          if (col) {
            col.gridTrackSize = savedCol.gridTrackSize;
          }
        }
      });

      return result;
    };
  }

  /**
   * Mirrors the internal `resizeHandleDrag$` pipeline from `DataGridComponent`:
   * for each `resizeHandleMouseDown$` emission, waits for the next
   * `resizeHandleContainerMouseUp$` via `mergeMap` + `take(1)`, then defers one
   * `requestAnimationFrame` tick before reading column widths.
   *
   * On completion, loads the current stored config from the grid's own
   * `configurationStrategy`, merges the live `gridTrackSize` values into the
   * `ColumnConfig` entries, and saves the enriched config back via the same
   * strategy — no separate storage key required.
   */
  private setupResizeSave(grid: DataGridComponent, until$: Observable<void>): void {
    if (!grid.configurationStrategy) {
      return;
    }

    if (!has(grid, 'resizeHandleMouseDown$')) {
      throw new Error(
        'GridColumnWidthService: patching failed. ' +
          'DataGridComponent.resizeHandleMouseDown$ not found.'
      );
    }

    if (!has(grid, 'resizeHandleContainerMouseUp$')) {
      throw new Error(
        'GridColumnWidthService: patching failed. ' +
          'DataGridComponent.resizeHandleContainerMouseUp$ not found.'
      );
    }

    grid.resizeHandleMouseDown$
      .pipe(
        takeUntil(until$),
        mergeMap(() =>
          grid.resizeHandleContainerMouseUp$.pipe(
            take(1),
            // Defer one animation frame so the grid's own requestAnimationFrame
            // callback — which writes the final gridTrackSize — executes first.
            mergeMap(
              () =>
                new Observable<void>((observer) => {
                  requestAnimationFrame(() => {
                    observer.next();
                    observer.complete();
                  });
                })
            )
          )
        ),
        // Load the current stored config, merge widths, save back.
        // switchMap cancels any in-flight load if another resize completes first.
        switchMap(() =>
          grid.configurationStrategy.getConfig$().pipe(
            take(1),
            switchMap((storedConfig) => {
              const widths = this.buildWidthMap(grid);
              const columns: ExtendedColumnConfig[] = (storedConfig?.columns ?? []).map((col) => ({
                ...col,
                ...(widths[col.name] ? { gridTrackSize: widths[col.name] } : {}),
              }));

              return grid.configurationStrategy.saveConfig$({
                ...storedConfig,
                columns,
              });
            })
          )
        )
      )
      .subscribe();
  }

  /**
   * Builds a `{ columnName → gridTrackSize }` map from the grid's current live
   * columns, excluding special fixed-position columns (checkbox, actions, etc.).
   */
  private buildWidthMap(grid: DataGridComponent): Record<string, string> {
    return grid.columns
      .filter((col) => !col.positionFixed && col.gridTrackSize)
      .reduce<Record<string, string>>((acc, col) => {
        acc[col.name] = col.gridTrackSize;

        return acc;
      }, {});
  }
}
