import { Component, inject, OnInit, signal } from '@angular/core';
import { IManagedObject, InventoryService } from '@c8y/client';
import { CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { CsvExportService } from '~services/csv-export.service';
import {
  ISmartViewManagedObject,
  SmartViewColumn,
} from '../../models/smart-view-configuration.model';
import { SmartViewExportService } from '../../services/smart-view-export.service';

type ExportState = 'loading' | 'confirm' | 'exporting' | 'done';

/**
 * Modal that guides the user through exporting all items of a Smart View as CSV.
 *
 * Flow: loading config → confirmation (item count) → exporting with progress → done.
 */
@Component({
  standalone: true,
  selector: 'app-smart-view-export-modal',
  templateUrl: './smart-view-export-modal.component.html',
  imports: [CoreModule],
  providers: [SmartViewExportService, CsvExportService],
})
export class SmartViewExportModalComponent implements OnInit {
  private readonly bsModalRef = inject(BsModalRef);
  private readonly inventoryService = inject(InventoryService);
  private readonly exportService = inject(SmartViewExportService);
  private readonly csvExportService = inject(CsvExportService);

  /**
   * ID of the Smart View managed object. Passed via BsModalService `initialState`.
   */
  smartViewId!: string;

  readonly state = signal<ExportState>('loading');
  readonly itemCount = signal(0);
  readonly progress = signal(0);
  readonly errorMessage = signal<string | null>(null);

  private smartViewMo: ISmartViewManagedObject | null = null;

  readonly labels = {
    title: gettext('Export Smart View as CSV'),
    loadingConfig: gettext('Loading smart view configuration…'),
    confirmPre: gettext('This will export'),
    confirmPost: gettext('items as a CSV file.'),
    confirmHint: gettext('Large exports may take a moment.'),
    exportingMessage: gettext('Fetching data, please wait…'),
    exportingAriaLabel: gettext('Export in progress'),
    done: gettext('Your download has started.'),
    export: gettext('Export'),
    cancel: gettext('Cancel'),
    close: gettext('Close'),
  };

  ngOnInit(): void {
    void this.loadConfig();
  }

  async onConfirm(): Promise<void> {
    const config = this.smartViewMo?.c8y_SmartViewConfiguration;

    if (!config) {
      return;
    }

    this.state.set('exporting');
    this.progress.set(0);

    try {
      const items = await this.exportService.fetchAll(config.query, (pct) =>
        this.progress.set(pct)
      );

      const rows = this.buildRows(items, config.columns);
      const filename = this.smartViewMo?.name ?? 'smart-view-export';

      this.csvExportService.downloadFile(rows, filename);
      this.state.set('done');
    } catch {
      this.errorMessage.set(gettext('Export failed. Please try again.'));
      this.state.set('confirm');
    }
  }

  onDismiss(): void {
    this.bsModalRef.hide();
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async loadConfig(): Promise<void> {
    try {
      const { data } = await this.inventoryService.detail(this.smartViewId);

      this.smartViewMo = data;

      const config = this.smartViewMo.c8y_SmartViewConfiguration;

      if (!config) {
        this.errorMessage.set(gettext('This managed object has no smart-view configuration.'));
        this.state.set('confirm');

        return;
      }

      const count = await this.exportService.countItems(config.query);

      this.itemCount.set(count);
    } catch {
      this.errorMessage.set(gettext('Could not load the smart view. Please try again.'));
    } finally {
      this.state.set('confirm');
    }
  }

  /**
   * Maps each managed object to a flat record keyed by the column header labels
   * defined in the Smart View configuration. Values are resolved via dot-notation
   * paths (e.g. `"owner"`, `"c8y_Hardware.serialNumber"`).
   */
  private buildRows(
    items: IManagedObject[],
    columns: SmartViewColumn[]
  ): Record<string, unknown>[] {
    return items.map((item) => {
      const row: Record<string, unknown> = {};

      for (const col of columns) {
        row[col.header] = this.resolvePath(item, col.path);
      }

      return row;
    });
  }

  /**
   * Resolves a dot-notation path (e.g. `"c8y_Hardware.serialNumber"`) against
   * a plain object, returning `undefined` when any segment is missing.
   */
  private resolvePath(obj: Record<string, unknown>, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, key) => {
      if (acc != null && typeof acc === 'object') {
        return (acc as Record<string, unknown>)[key];
      }

      return undefined;
    }, obj);
  }
}
