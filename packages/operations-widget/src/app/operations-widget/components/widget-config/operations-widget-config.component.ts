import { Component, Input } from '@angular/core';
import { OperationWidgetConfig } from '../../models/operations-widget-config.model';
import { ICONS } from '../../models/icons.const';

@Component({
  selector: 'app-operations-widget-config',
  templateUrl: './operations-widget-config.component.html',
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
      label: 'Restart',
      description: 'Restart device',
      operationFragment: 'c8y_Restart',
      buttonClasses: 'btn-default',
      operationValue: '{\n  "operation_name": {},\n  "description": "This is my operation!"\n}',
      showModal: false,
      modalText: 'Confirm device restart',
      customOperation: false,
    });

    if (this.config.device && this.config.device['c8y_SupportedOperations']) {
      this.supportedOperations = this.config.device['c8y_SupportedOperations'];
    }
  }

  removeButton(index: number): void {
    this.config.buttons.splice(index, 1);
  }
}
