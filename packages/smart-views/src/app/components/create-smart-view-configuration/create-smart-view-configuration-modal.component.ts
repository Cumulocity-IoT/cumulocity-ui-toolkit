import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AlertService, CoreModule } from '@c8y/ngx-components';
import { IconSelectorService } from '@c8y/ngx-components/icon-selector';
import { gettext } from '@c8y/ngx-components/gettext';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { DtmService } from '~services/dtm.service';
import { DtmPropertyDefinition } from '~models/dtm.model';
import { AssetDefinition, SmartViewColumn, SmartViewConfiguration } from '../../smart-views.model';
import { SmartViewConfigurationService } from '../../services/smart-view-configuration.service';

/**
 * Modal used to create a new smart view configuration or edit an existing one.
 * In edit mode, the existing configuration is passed via the modal's
 * `initialState.configuration`.
 */
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
  private readonly iconSelectorService = inject(IconSelectorService);
  private readonly dtmService = inject(DtmService);

  /** Existing configuration to edit. When unset, the modal creates a new one. */
  configuration?: SmartViewConfiguration;

  readonly assetDefinitions = signal<AssetDefinition[]>([]);
  readonly loadingDefinitions = signal(true);
  readonly loadingProperties = signal(false);
  readonly columnsFromDefinition = signal(false);
  readonly saving = signal(false);

  /** Columns pre-configured for every new configuration. */
  private static readonly DEFAULT_COLUMNS: SmartViewColumn[] = [
    { name: 'id', path: 'id', header: 'ID' },
    { name: 'name', path: 'name', header: 'Name' },
    { name: 'description', path: 'description', header: 'Description' },
  ];

  /** Default navigator menu priority for a new configuration. */
  private static readonly DEFAULT_PRIORITY = 500;

  /** Form model bound to the template. */
  name = '';
  icon = 'telescope';
  assetDefinitionId = '';
  priority = CreateSmartViewConfigurationModalComponent.DEFAULT_PRIORITY;
  columns: SmartViewColumn[] = CreateSmartViewConfigurationModalComponent.DEFAULT_COLUMNS.map(
    (column) => ({ ...column })
  );

  readonly labels = {
    createTitle: gettext('Create smart view configuration'),
    editTitle: gettext('Edit smart view configuration'),
    name: gettext('Name'),
    namePlaceholder: gettext('e.g. Pumps overview'),
    icon: gettext('Icon'),
    selectIcon: gettext('Select icon'),
    assetDefinition: gettext('Asset definition'),
    assetDefinitionPlaceholder: gettext('Select an asset definition'),
    noDefinitions: gettext('No asset definitions found.'),
    priority: gettext('Priority'),
    priorityHint: gettext(
      'Determines the position in the navigator menu. Higher values appear first.'
    ),
    columns: gettext('Columns'),
    columnsFromDefinition: gettext(
      'Auto-populated from the asset definition. You can still edit, add, or remove columns.'
    ),
    loadingProperties: gettext('Loading property definitions…'),
    columnName: gettext('Name'),
    columnPath: gettext('Path'),
    columnHeader: gettext('Header'),
    addColumn: gettext('Add column'),
    removeColumn: gettext('Remove column'),
    create: gettext('Create'),
    save: gettext('Save'),
    cancel: gettext('Cancel'),
  };

  get isEditMode(): boolean {
    return !!this.configuration;
  }

  get title(): string {
    return this.isEditMode ? this.labels.editTitle : this.labels.createTitle;
  }

  get okLabel(): string {
    return this.isEditMode ? this.labels.save : this.labels.create;
  }

  ngOnInit(): void {
    if (this.configuration) {
      this.applyConfiguration(this.configuration);
    }

    void this.loadAssetDefinitions();
  }

  /** True when the form has the minimum data required to save a configuration. */
  get isValid(): boolean {
    return (
      !!this.name.trim() &&
      !!this.assetDefinitionId &&
      this.columns.some((column) => column.name.trim() && column.path.trim())
    );
  }

  /** Defaults the icon and eagerly loads property-derived columns on definition change. */
  onAssetDefinitionChange(): void {
    const assetDefinition = this.assetDefinitions().find(
      (definition) => definition.id === this.assetDefinitionId
    );

    if (!assetDefinition) {
      return;
    }

    const iconName = assetDefinition.icon?.name;

    if (iconName) {
      this.icon = iconName;
    }

    this.columnsFromDefinition.set(false);
    void this.loadColumnsFromDefinition(assetDefinition);
  }

  /** Opens the icon selector modal and stores the chosen icon. */
  async selectIcon(): Promise<void> {
    try {
      const selected = await this.iconSelectorService.selectIcon({
        title: this.labels.selectIcon,
        currentSelection: this.icon,
      });

      if (selected) {
        this.icon = selected;
      }
    } catch {
      // Selection dismissed — keep the current icon.
    }
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

    const draft = {
      name: this.name.trim(),
      icon: this.icon?.trim() || 'telescope',
      assetDefinitionId: this.assetDefinitionId,
      assetDefinitionName: assetDefinition?.name ?? '',
      priority: this.priority ?? CreateSmartViewConfigurationModalComponent.DEFAULT_PRIORITY,
      columns: this.columns
        .filter((column) => column.name.trim() && column.path.trim())
        .map((column) => ({
          name: column.name.trim(),
          path: column.path.trim(),
          header: column.header.trim() || column.name.trim(),
        })),
    };

    this.saving.set(true);

    try {
      if (this.configuration) {
        await this.configurationService.update(this.configuration.id, draft);
        this.alertService.success(gettext('Smart view configuration updated.'));
      } else {
        await this.configurationService.create(draft);
        this.alertService.success(gettext('Smart view configuration created.'));
      }
      this.bsModalRef.hide();
    } catch {
      this.alertService.danger(gettext('Could not save smart view configuration.'));
    } finally {
      this.saving.set(false);
    }
  }

  onDismiss(): void {
    this.bsModalRef.hide();
  }

  /**
   * Fetches the DTM Asset Definition for the selected definition, then loads
   * its allowed properties and converts them to columns.
   *
   * The default columns (ID, Name, Description) are always prepended and
   * deduplicated against the DTM-derived ones. Fails silently when the DTM
   * microservice is unavailable so the user can still edit columns manually.
   */
  private async loadColumnsFromDefinition(assetDefinition: AssetDefinition): Promise<void> {
    this.loadingProperties.set(true);

    try {
      const dtmDefinition = await this.dtmService.getAssetDefinition(assetDefinition.name);
      const allowedProperties = dtmDefinition.composition?.allowedProperties ?? [];

      if (!allowedProperties.length) {
        return;
      }

      const identifiers = allowedProperties.map((p) => p.identifier);
      const propertyDefinitions = await this.dtmService.getPropertyDefinitions(identifiers);

      this.columns = this.buildColumnsFromProperties(identifiers, propertyDefinitions);
      this.columnsFromDefinition.set(true);
    } catch {
      // DTM unavailable or definition not found — keep the current columns.
      this.columnsFromDefinition.set(false);
    } finally {
      this.loadingProperties.set(false);
    }
  }

  /**
   * Merges default columns with DTM-derived property columns, preserving the
   * order of `allowedProperties` from the asset definition and deduplicating
   * against the defaults.
   */
  private buildColumnsFromProperties(
    orderedIdentifiers: string[],
    propertyDefinitions: DtmPropertyDefinition[]
  ): SmartViewColumn[] {
    const propMap = new Map(propertyDefinitions.map((p) => [p.identifier, p]));

    const dtmColumns: SmartViewColumn[] = orderedIdentifiers
      .map((id) => propMap.get(id))
      .filter((p): p is DtmPropertyDefinition => p != null)
      .map((p) => ({
        name: p.identifier,
        path: p.identifier,
        header: p.jsonSchema.title,
      }));

    const dtmKeys = new Set(dtmColumns.map((c) => c.name));
    const defaults = CreateSmartViewConfigurationModalComponent.DEFAULT_COLUMNS.filter(
      (c) => !dtmKeys.has(c.name)
    ).map((c) => ({ ...c }));

    return [...defaults, ...dtmColumns];
  }

  /** Pre-fills the form fields from an existing configuration (edit mode). */
  private applyConfiguration(configuration: SmartViewConfiguration): void {
    const data = configuration.c8y_SmartViewConfiguration;

    this.name = configuration.name ?? '';
    this.icon = data?.icon ?? 'telescope';
    this.assetDefinitionId = data?.assetDefinitionId ?? '';
    this.priority = data?.priority ?? CreateSmartViewConfigurationModalComponent.DEFAULT_PRIORITY;
    this.columns =
      data?.columns?.length > 0
        ? data.columns.map((column) => ({ ...column }))
        : [{ name: '', path: '', header: '' }];
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
