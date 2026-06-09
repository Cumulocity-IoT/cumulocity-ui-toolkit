import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertService, CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { AssetDefinition, SmartViewColumn } from '../../smart-views.model';
import { SmartViewConfigurationService } from '../../services/smart-view-configuration.service';

@Component({
  standalone: true,
  selector: 'app-create-smart-view-configuration-modal',
  templateUrl: './create-smart-view-configuration-modal.component.html',
  imports: [CoreModule, FormsModule],
})
export class CreateSmartViewConfigurationModalComponent implements OnInit {
  private readonly bsModalRef = inject(BsModalRef);
  private readonly alertService = inject(AlertService);
  private readonly configurationService = inject(SmartViewConfigurationService);

  readonly assetDefinitions = signal<AssetDefinition[]>([]);
  readonly loadingDefinitions = signal(true);
  readonly saving = signal(false);

  /** Form model bound to the template. */
  name = '';
  icon = 'telescope';
  assetDefinitionId = '';
  columns: SmartViewColumn[] = [{ name: '', path: '', header: '' }];

  readonly labels = {
    title: gettext('Create smart view configuration'),
    name: gettext('Name'),
    namePlaceholder: gettext('e.g. Pumps overview'),
    icon: gettext('Icon'),
    assetDefinition: gettext('Asset definition'),
    assetDefinitionPlaceholder: gettext('Select an asset definition'),
    noDefinitions: gettext('No asset definitions found.'),
    columns: gettext('Columns'),
    columnName: gettext('Name'),
    columnPath: gettext('Path'),
    columnHeader: gettext('Header'),
    addColumn: gettext('Add column'),
    removeColumn: gettext('Remove column'),
    ok: gettext('Create'),
    cancel: gettext('Cancel'),
  };

  ngOnInit(): void {
    void this.loadAssetDefinitions();
  }

  /** True when the form has the minimum data required to create a configuration. */
  get isValid(): boolean {
    return (
      !!this.name.trim() &&
      !!this.assetDefinitionId &&
      this.columns.some((column) => column.name.trim() && column.path.trim())
    );
  }

  addColumn(): void {
    this.columns = [...this.columns, { name: '', path: '', header: '' }];
  }

  removeColumn(index: number): void {
    this.columns = this.columns.filter((_, i) => i !== index);
  }

  async onClose(): Promise<void> {
    if (!this.isValid || this.saving()) {
      return;
    }

    const assetDefinition = this.assetDefinitions().find(
      (definition) => definition.id === this.assetDefinitionId
    );

    this.saving.set(true);

    try {
      await this.configurationService.create({
        name: this.name.trim(),
        icon: this.icon?.trim() || 'telescope',
        assetDefinitionId: this.assetDefinitionId,
        assetDefinitionName: assetDefinition?.name ?? '',
        columns: this.columns
          .filter((column) => column.name.trim() && column.path.trim())
          .map((column) => ({
            name: column.name.trim(),
            path: column.path.trim(),
            header: column.header.trim() || column.name.trim(),
          })),
      });
      this.alertService.success(gettext('Smart view configuration created.'));
      this.bsModalRef.hide();
    } catch {
      this.alertService.danger(gettext('Could not create smart view configuration.'));
    } finally {
      this.saving.set(false);
    }
  }

  onDismiss(): void {
    this.bsModalRef.hide();
  }

  private async loadAssetDefinitions(): Promise<void> {
    try {
      this.assetDefinitions.set(await this.configurationService.listAssetDefinitions());
    } catch {
      this.alertService.danger(gettext('Could not load asset definitions.'));
    } finally {
      this.loadingDefinitions.set(false);
    }
  }
}
