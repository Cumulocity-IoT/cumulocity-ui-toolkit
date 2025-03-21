import { Component, Input } from '@angular/core';
import { OperationWidgetConfig } from '../../models/operations-widget-config.model';
import { ICONS } from '../../models/icons.const';

@Component({
  selector: 'app-operations-widget-config',
  templateUrl: './operations-widget-config.component.html',
  styleUrl: './operations-widget-config.component.scss',
})
export class OperationsWidgetConfigComponent {
  @Input() config: OperationWidgetConfig = {};

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

  addNewButton(): void {
    if (!this.config.buttons) {
      this.config.buttons = [];
    }

    this.config.buttons.push({
      icon: undefined,
      label: 'Your Button Label',
      description: '',
      operationFragment: '',
      buttonClasses: 'btn-default',
      operationValue: '{}',
      showModal: false,
      modalText: 'please confirm device operation',
      customOperation: false,
    });

    if (this.config.device && this.config.device['c8y_SupportedOperations']) {
      this.supportedOperations = this.config.device['c8y_SupportedOperations'] as string[];
    }
  }

  removeButton(index: number): void {
    this.config.buttons?.splice(index, 1);
  }
}
