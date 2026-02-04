import { inject, Injectable } from '@angular/core';
import { IManagedObject, IOperation, IResult, ITenantOption, OperationService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { OperationButtonConfig } from '../models/operations-widget-config.model';

export interface TenantOptionConfiguration extends IManagedObject {
  type: 'tenant_option_plugin_config';
  options: ITenantOption[];
}
@Injectable()
export class OperationsWidgetService {
  private operationsService = inject(OperationService);
  private alertService = inject(AlertService);

  async createOperation(button: OperationButtonConfig, operationValue: IOperation): Promise<void> {
    let request: IResult<IOperation> | null = null;

    const operation: IOperation = {
      ...operationValue,
      description: button.description,
    };

    try {
      request = await this.operationsService.create(operation);
    } catch (error) {
      console.error('Error creating operation:', error);
      this.alertService.danger(`Failed to create '${button.label}' operation.`);
    }

    if (request && request.res.status === 201) {
      this.alertService.success(`Operation '${button.label}' successfully created.`);
    }
  }
}
