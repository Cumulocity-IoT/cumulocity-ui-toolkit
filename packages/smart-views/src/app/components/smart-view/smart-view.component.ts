import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { InventoryService } from '@c8y/client';
import { Column, CoreModule, Pagination } from '@c8y/ngx-components';
import { isSmartViewManagedObject } from '../../models/smart-view-configuration.model';
import { gettext } from '@c8y/ngx-components/gettext';
import {
  ISmartViewManagedObject,
  SmartViewColumn,
} from '../../models/smart-view-configuration.model';
import { SmartViewDatasourceService } from '../../services/smart-view-datasource.service';

@Component({
  standalone: true,
  selector: 'app-smart-view',
  templateUrl: './smart-view.component.html',
  styleUrls: ['./smart-view.component.less'],
  imports: [CoreModule, RouterModule],
  providers: [SmartViewDatasourceService],
})
export class SmartViewComponent implements OnInit {
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly inventoryService = inject(InventoryService);
  readonly datasource = inject(SmartViewDatasourceService);
  private readonly destroyRef = inject(DestroyRef);

  readonly managedObject = signal<ISmartViewManagedObject | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly columns = signal<Column[]>([]);
  readonly isAsset = signal(false);

  readonly pagination: Pagination = { pageSize: 30, currentPage: 1 };

  readonly labels = {
    loading: gettext('Loading smart view…'),
    id: gettext('ID'),
    name: gettext('Name'),
    type: gettext('Type'),
    lastUpdated: gettext('Last updated'),
    noConfig: gettext('This managed object has no smart-view configuration.'),
  };

  ngOnInit(): void {
    this.activatedRoute.paramMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => void this.loadDevice(params.get('id')));
  }

  private async loadDevice(deviceId: string | null): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.managedObject.set(null);
    this.columns.set([]);

    if (!deviceId) {
      this.errorMessage.set('No device ID provided in the route.');
      this.loading.set(false);

      return;
    }

    try {
      const { data } = await this.inventoryService.detail(deviceId);

      this.managedObject.set(data);
      this.isAsset.set('c8y_IsAsset' in data);

      // data carries [key: string]: any — read through unknown to stay type-safe.
      if (isSmartViewManagedObject(data)) {
        const config = data.c8y_SmartViewConfiguration;

        this.datasource.configure(config);
        this.columns.set(this.buildColumns(config.columns));
      }
    } catch {
      this.errorMessage.set(`Could not load managed object with ID "${deviceId}".`);
    } finally {
      this.loading.set(false);
    }
  }

  private buildColumns(smartViewColumns: SmartViewColumn[]): Column[] {
    return smartViewColumns.map((col) => ({
      name: col.name,
      path: col.path,
      header: col.header,
      sortable: col.path !== 'id',
      filterable: col.path !== 'id',
      searchable: col.path !== 'id',
    }));
  }
}
