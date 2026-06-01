import { inject, Injectable } from '@angular/core';
import { IManagedObject, IOperation, ITenantOption, OperationService } from '@c8y/client';
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

  /**
   * Sends a Cumulocity operation built from `operationValue` merged with the
   * button's `description`.  Displays a success or danger alert depending on
   * whether the API call resolves or rejects.
   *
   * @param button - The button configuration driving this operation (provides label + description).
   * @param operationValue - The pre-populated operation payload (must include `deviceId`).
   */
  async createOperation(button: OperationButtonConfig, operationValue: IOperation): Promise<void> {
    const operation: IOperation = {
      ...operationValue,
      description: button.description,
    };

    try {
      await this.operationsService.create(operation);
      this.alertService.success(`Operation '${button.label}' successfully created.`);
    } catch (error) {
      console.error('Error creating operation:', error);
      this.alertService.danger(`Failed to create '${button.label}' operation.`);
    }
  }
}
