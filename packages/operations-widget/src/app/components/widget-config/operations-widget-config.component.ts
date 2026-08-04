import { Component, inject, Input, TemplateRef, ViewChild } from '@angular/core';
import { CoreModule, HumanizePipe } from '@c8y/ngx-components';
import { IconSelectorService } from '@c8y/ngx-components/icon-selector';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { extractPlaceholdersFromObject } from '~helpers/extract-placeholders';
import {
  OperationButtonConfig,
  OperationParamConfig,
  OperationWidgetConfig,
} from '../../models/operations-widget-config.model';
import { OperationsEditorComponent } from '../operations-value/operations-editor.component';
import { OperationsWidgetComponent } from '../operations-widget/operations-widget.component';
import { WidgetConfigService } from '@c8y/ngx-components/context-dashboard';
import { setWidgetPreview } from '~helpers/widget-preview.helper';

@Component({
  selector: 'app-operations-widget-config',
  templateUrl: './operations-widget-config.component.html',
  styleUrl: './operations-widget-config.component.scss',
  standalone: true,
  imports: [CoreModule, BsDropdownModule, OperationsEditorComponent, OperationsWidgetComponent],
})
export class OperationsWidgetConfigComponent {
  private readonly widgetConfigService = inject(WidgetConfigService);
  private readonly iconSelector = inject(IconSelectorService);
  private humanize = inject(HumanizePipe);

  @ViewChild('widgetPreview')
  set previewMapSet(template: TemplateRef<unknown>) {
    setWidgetPreview(this.widgetConfigService, template);
  }

  @Input() get config(): OperationWidgetConfig {
    return this._config;
  }

  set config(config: OperationWidgetConfig) {
    this._config = config;
    this.setSupportedOperations();
  }

  buttonClasses = [
    'btn-default',
    'btn-primary',
    'btn-secondary',
    'btn-success',
    'btn-danger',
    'btn-emphasis',
    'btn-info',
    'btn-warning',
    'btn-link',
  ];

  supportedOperations: string[] = [];

  private _config: OperationWidgetConfig;

  async openIconSelector(item: OperationButtonConfig): Promise<void> {
    const icon = await this.iconSelector.selectIcon({ currentSelection: item.icon });

    if (icon) {
      item.icon = icon;
    }
  }

  /**
   * `buttons` and `fields` are optional on the persisted config, so every access
   * goes through these two helpers instead of repeating the guards inline.
   */
  private fieldsOf(buttonIndex: number): OperationParamConfig[] | undefined {
    const button = this.config.buttons?.[buttonIndex];

    if (!button) {
      return undefined;
    }

    return (button.fields ??= []);
  }

  addField(buttonIndex: number, placeholder: { key: string; path: string }) {
    this.fieldsOf(buttonIndex)?.push({
      key: placeholder.key,
      path: placeholder.path,
      label: this.humanize.transform(placeholder.key),
      type: 'input',
      options: [],
    });
  }

  updateField(buttonIndex: number, placeholder: { key: string; path: string }) {
    const field = this.fieldsOf(buttonIndex)?.find((f) => f.key === placeholder.key);

    if (field) {
      field.path = placeholder.path;
    }
  }

  addOption(field: OperationParamConfig) {
    (field.options ??= []).push({ label: '', value: '' });
  }

  removeField(buttonIndex: number, key: string) {
    const fields = this.fieldsOf(buttonIndex);
    const idx = fields?.findIndex((f) => f.key === key) ?? -1;

    if (fields && idx !== -1) {
      fields.splice(idx, 1);
    }
  }

  removeOption(field: OperationParamConfig, index: number) {
    field.options?.splice(index, 1);
  }

  addNewButton(): void {
    if (!this.config.buttons) {
      this.config.buttons = [];
    }

    const value = {
      deviceId: this.config.device?.id,
    };

    const button: OperationButtonConfig = {
      icon: undefined,
      label: 'Your Button Label',
      description: '',
      operationFragment: '',
      buttonClasses: 'btn-default',
      operationValue: JSON.stringify(value),
      showModal: false,
      modalText: 'Are you sure you want to create this operation?',
      customOperation: false,
    };

    if (this.supportedOperations.length) {
      button.operationFragment = this.supportedOperations[0];
    }

    this.config.buttons.push(button);
  }

  removeButton(index: number): void {
    this.config.buttons?.splice(index, 1);
  }

  onOperationBodyChanged(operation: string, buttonIndex: number) {
    let json: Record<string, unknown>;

    try {
      json = JSON.parse(operation) as Record<string, unknown>;
    } catch {
      // Invalid while the user is still typing; placeholders re-sync on the next
      // valid payload. Only the parse is guarded so real sync failures surface.
      return;
    }

    const button = this.config.buttons?.[buttonIndex];

    if (!button) {
      return;
    }

    button.operationValue = operation;

    const placeholders = extractPlaceholdersFromObject(json);
    const placeholderKeys = (placeholders ?? []).map((p) => p.key);
    const fields = button.fields ?? [];
    const fieldKeys = fields.map((f) => f.key);
    const newPlaceholders = placeholders.filter((p) => !fieldKeys.includes(p.key));
    const updatePlaceholders = placeholders.filter((p) => fieldKeys.includes(p.key));

    // Add placeholders which are not yet part of the fields
    for (const n of newPlaceholders) {
      this.addField(buttonIndex, n);
    }

    // Update in case the path changed
    for (const update of updatePlaceholders) {
      this.updateField(buttonIndex, update);
    }

    // Remove fields whose keys are not in placeholders anymore
    const removedFieldKeys = fieldKeys.filter((k) => !placeholderKeys.includes(k));

    for (const key of removedFieldKeys) {
      this.removeField(buttonIndex, key);
    }
  }

  private setSupportedOperations(): void {
    if (this.config.device && this.config.device['c8y_SupportedOperations']) {
      this.supportedOperations = this.config.device['c8y_SupportedOperations'].sort();
    }
  }
}
