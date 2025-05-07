import { Injectable } from '@angular/core';
import { DataGridComponent } from '@c8y/ngx-components';
import { invoke, set, has } from 'lodash';

@Injectable({ providedIn: 'root' })
export class DataGridPatchService {
  readonly ORIGINAL_METHOD_BACKUP_ATTRIBUTE_NAME = 'multiSortMethod';
  /**
   * Enforces that always only one column can be sorted.
   * WARNING: This method might brake in the future as private API is accessed!
   *
   * Usage in your component:
   *
   * @ViewChild(DataGridComponent, { static: false })
   * set grid(value: DataGridComponent) {
   *   if (value) {
   *     this.patchService.applySingleSortBehavior(value);
   *   }
   * }
   *
   * @param grid
   */
  applySingleSortBehavior(grid: DataGridComponent): void {
    if (has(grid, this.ORIGINAL_METHOD_BACKUP_ATTRIBUTE_NAME)) {
      return;
    }

    if (!has(grid, 'changeSortOrder')) {
      throw new Error('Patching of c8y-data-grid failed. Method changeSortOrder not found.');
    }
    set(grid, this.ORIGINAL_METHOD_BACKUP_ATTRIBUTE_NAME, grid.changeSortOrder);

    grid.changeSortOrder = (columnName) => {
      const oldSortedColumns = grid.columns.filter(
        (c) => c.name !== columnName && c.sortable && c.sortOrder !== ''
      );

      oldSortedColumns.map((c) => {
        c.sortOrder = '';

        return c;
      });

      invoke(grid, this.ORIGINAL_METHOD_BACKUP_ATTRIBUTE_NAME, columnName);
    };
  }
}
