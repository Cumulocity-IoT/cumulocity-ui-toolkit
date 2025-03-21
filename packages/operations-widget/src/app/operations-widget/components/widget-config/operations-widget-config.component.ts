import { Component, Input } from '@angular/core';
import { ICONS } from '../../models/icons.const';
import {
  OperationButtonConfig,
  OperationWidgetConfig,
} from '../../models/operations-widget-config.model';

@Component({
  selector: 'app-operations-widget-config',
  templateUrl: './operations-widget-config.component.html',
  styleUrl: './operations-widget-config.component.scss',
})
export class OperationsWidgetConfigComponent {
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

  addNewButton(): void {
    if (!this.config.buttons) {
      this.config.buttons = [];
    }

    const button: OperationButtonConfig = {
      icon: undefined,
      label: 'Your Button Label',
      description: '',
      operationFragment: '',
      buttonClasses: 'btn-default',
      operationValue: '{}',
      showModal: false,
      modalText: 'please confirm device operation',
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

  private setSupportedOperations(): void {
    if (!this.supportedOperations.length) {
      if (this.config.device && this.config.device['c8y_SupportedOperations']) {
        this.supportedOperations = this.config.device['c8y_SupportedOperations'].sort();
      }
    }
  }
}
