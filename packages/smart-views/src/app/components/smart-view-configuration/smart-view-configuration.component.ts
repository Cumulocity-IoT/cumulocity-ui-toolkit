import { Component, DestroyRef, type OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  type ActionControl,
  BuiltInActionType,
  type Column,
  CoreModule,
  type DisplayOptions,
  ModalService,
  type Pagination,
  Status,
} from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { TranslateService } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import { type SmartViewConfiguration } from '../../smart-views.model';
import { SmartViewConfigurationService } from '../../services/smart-view-configuration.service';
import { CreateSmartViewConfigurationModalComponent } from '../create-smart-view-configuration/create-smart-view-configuration-modal.component';

@Component({
  standalone: true,
  selector: 'app-smart-view-configuration',
  templateUrl: './smart-view-configuration.component.html',
  styleUrls: ['./smart-view-configuration.component.less'],
  imports: [CoreModule],
})
export class SmartViewConfigurationComponent implements OnInit {
  private readonly configurationService = inject(SmartViewConfigurationService);
  private readonly modalService = inject(BsModalService);
  private readonly c8yModalService = inject(ModalService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly translateService = inject(TranslateService);

  readonly configurations = signal<SmartViewConfiguration[]>([]);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly labels = {
    title: gettext('Smart views configuration'),
    description: gettext('Manage and configure smart views for your devices.'),
    empty: gettext('No smart view configurations found.'),
  };

  readonly pagination: Pagination = {
    pageSize: 25,
    currentPage: 1,
  };

  readonly displayOptions: DisplayOptions = {
    bordered: true,
    striped: true,
    filter: true,
    gridHeader: true,
    hover: true,
  };

  readonly columns: Column[] = [
    {
      name: 'name',
      header: gettext('Name'),
      path: 'name',
      filterable: true,
      sortable: true,
    },
    {
      name: 'id',
      header: gettext('ID'),
      path: 'id',
      filterable: true,
      sortable: true,
    },
    {
      name: 'icon',
      header: gettext('Icon'),
      path: 'c8y_SmartViewConfiguration.icon',
      filterable: true,
      sortable: true,
    },
    {
      name: 'query',
      header: gettext('Query'),
      path: 'c8y_SmartViewConfiguration.query',
      filterable: true,
      sortable: true,
    },
  ];

  readonly actionControls: ActionControl[] = [
    {
      type: BuiltInActionType.Edit,
      callback: (item: SmartViewConfiguration) => this.editConfiguration(item),
    },
    {
      type: BuiltInActionType.Delete,
      callback: (item: SmartViewConfiguration) => void this.deleteConfiguration(item),
    },
  ];

  ngOnInit(): void {
    void this.loadConfigurations();

    // Reload the grid whenever a configuration is created elsewhere
    // (e.g. via the action-bar "Add configuration" modal).
    this.configurationService.configurationsChanged$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => void this.loadConfigurations());
  }

  /** Opens the modal pre-filled with the given configuration for editing. */
  editConfiguration(configuration: SmartViewConfiguration): void {
    this.modalService.show(CreateSmartViewConfigurationModalComponent, {
      class: 'modal-md',
      initialState: { configuration },
    });
  }

  /** Asks for confirmation, then deletes the given configuration. */
  async deleteConfiguration(configuration: SmartViewConfiguration): Promise<void> {
    const confirmed = await this.c8yModalService.confirm(
      gettext('Delete configuration'),
      this.translateService.instant(gettext('Are you sure you want to delete "{{ name }}"?'), {
        name: configuration.name,
      }) as string,
      Status.DANGER,
      { ok: gettext('Delete'), cancel: gettext('Cancel') }
    );

    if (!confirmed) {
      return;
    }

    try {
      await this.configurationService.delete(configuration.id);
    } catch {
      this.errorMessage.set(gettext('Could not delete smart view configuration.'));
    }
  }

  private async loadConfigurations(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);

    try {
      this.configurations.set(await this.configurationService.listConfigurations());
    } catch {
      this.errorMessage.set(gettext('Could not load smart view configurations.'));
    } finally {
      this.loading.set(false);
    }
  }
}
