import { Component, inject, Input } from '@angular/core';
import { ICONS } from '../../models/icons.const';
import {
  OperationButtonConfig,
  OperationParamConfig,
  OperationWidgetConfig,
} from '../../models/operations-widget-config.model';
import { CoreModule, HumanizePipe } from '@c8y/ngx-components';
import { OperationsEditorComponent } from '../operations-value/operations-editor.component';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { ButtonInstanceComponent } from '../button-instance/button-instance.component';
import { extractPlaceholdersFromObject } from '~helpers/extract-placeholders';

@Component({
  selector: 'app-operations-widget-config',
  templateUrl: './operations-widget-config.component.html',
  styleUrl: './operations-widget-config.component.scss',
  standalone: true,
  imports: [CoreModule, BsDropdownModule, ButtonInstanceComponent, OperationsEditorComponent],
})
export class OperationsWidgetConfigComponent {
  private humanize = inject(HumanizePipe);

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

  availableIcons: string[] = [...ICONS];
  supportedOperations: string[] = [];

  private _config: OperationWidgetConfig;

  addField(buttonIndex: number, placeholder: { key: string; path: string }) {
    if (!this.config.buttons[buttonIndex].fields) this.config.buttons[buttonIndex].fields = [];
    this.config.buttons[buttonIndex].fields.push({
      key: placeholder.key,
      path: placeholder.path,
      label: this.humanize.transform(placeholder.key),
      type: 'input',
      options: [],
    });
  }

  updateField(buttonIndex: number, placeholder: { key: string; path: string }) {
    const field = this.config.buttons[buttonIndex].fields.find((f) => f.key === placeholder.key);

    if (field) {
      field.path = placeholder.path;
    }
  }

  addOption(field: OperationParamConfig) {
    if (!field.options) field.options = [];
    field.options.push({ label: '', value: '' });
  }

  removeField(buttonIndex: number, key: string) {
    const fields = this.config.buttons[buttonIndex].fields;
    const idx = fields.findIndex((f) => f.key === key);

    if (idx !== -1) {
      this.config.buttons[buttonIndex].fields.splice(idx, 1);
    }
  }

  removeOption(field: OperationParamConfig, index: number) {
    field.options.splice(index, 1);
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
    try {
      const json = JSON.parse(operation) as Record<string, unknown>;

      this._config.buttons[buttonIndex].operationValue = operation;
      console.warn(operation);
      const placeholders = extractPlaceholdersFromObject(json);
      const placeholderKeys = (placeholders ?? []).map((p) => p.key);
      const fields = this.config.buttons[buttonIndex].fields ?? [];
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
    } catch (error) {
      console.error(error);
    }
  }

  private setSupportedOperations(): void {
    if (this.config.device && this.config.device['c8y_SupportedOperations']) {
      this.supportedOperations = this.config.device['c8y_SupportedOperations'].sort();
    }
  }
}
