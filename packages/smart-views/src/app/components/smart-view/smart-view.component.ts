import { Component, DestroyRef, inject, type OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { InventoryService } from '@c8y/client';
import { type Column, CoreModule, type Pagination } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { TranslateService } from '@ngx-translate/core';
import {
  isSmartViewConfiguration,
  type SmartViewColumn,
  type SmartViewConfiguration,
} from '../../smart-views.model';
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
  private readonly translateService = inject(TranslateService);

  readonly managedObject = signal<SmartViewConfiguration | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly columns = signal<Column[]>([]);
  readonly isAsset = signal(false);
  readonly title = signal('');

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
      this.errorMessage.set(this.translate(gettext('No smart view ID provided in the route.')));
      this.loading.set(false);

      return;
    }

    try {
      const { data } = await this.inventoryService.detail(deviceId);

      this.title.set((data.name as string | undefined) ?? deviceId);

      if (isSmartViewConfiguration(data)) {
        const config = data.c8y_SmartViewConfiguration;

        this.datasource.configure(config);
        this.columns.set(this.buildColumns(config.columns ?? []));
        this.managedObject.set(data);
      } else {
        this.errorMessage.set(this.translate(this.labels.noConfig));
      }
    } catch {
      this.errorMessage.set(
        this.translate(gettext('Could not load smart view with ID "{{ id }}".'), {
          id: deviceId,
        })
      );
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

  private translate(key: string, params?: Record<string, unknown>): string {
    return this.translateService.instant(key, params) as string;
  }
}
