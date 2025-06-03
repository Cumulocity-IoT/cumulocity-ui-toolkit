import { Component, inject, Input } from '@angular/core';
import { IOperation, IResult, OperationService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import {
  OperationButtonConfig,
  OperationWidgetConfig,
} from '../../models/operations-widget-config.model';

@Component({
  selector: 'app-operations-widget',
  templateUrl: './operations-widget.component.html',
  styleUrls: ['./operations-widget.component.scss'],
})
export class OperationsWidgetComponent {
  private operationsService = inject(OperationService);
  private alertService = inject(AlertService);

  @Input() config: OperationWidgetConfig = {};
  buttons: OperationButtonConfig[] = [];

  async onButtonClick(button: OperationButtonConfig): Promise<void> {
    if (!this.config.device || !this.config.device.id) {
      this.alertService.danger(
        `No target device configured for this widget. Unable to create operation.`
      );

      return;
    }

    const operationValue = JSON.parse(button.operationValue) as Partial<IOperation>;
    let request: IResult<IOperation> | null = null;

    const operation: IOperation = {
      deviceId: this.config.device.id,
      [button.operationFragment]: operationValue || {},
      description: button.description,
    };

    operation.deviceId = this.config.device.id;

    try {
      request = await this.operationsService.create(operation);
    } catch (error) {
      this.alertService.danger(`Failed to create '${button.label}' operation.`);
    }

    if (request && request.res.status === 200) {
      this.alertService.success(`Operation '${button.label}' successfully created.`);
    }
  }
}
