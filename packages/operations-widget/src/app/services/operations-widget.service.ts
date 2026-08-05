import { inject, Injectable } from '@angular/core';
import { IOperation, OperationService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { TranslateService } from '@ngx-translate/core';
import { OperationButtonConfig } from '../models/operations-widget-config.model';

@Injectable()
export class OperationsWidgetService {
  private operationsService = inject(OperationService);
  private alertService = inject(AlertService);
  private translateService = inject(TranslateService);

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
      this.alertService.success(
        this.translateService.instant(gettext(`Operation '{{ label }}' successfully created.`), {
          label: button.label,
        }) as string
      );
    } catch (error) {
      this.alertService.danger(
        this.translateService.instant(gettext(`Failed to create '{{ label }}' operation.`), {
          label: button.label,
        }) as string,
        error as string
      );
    }
  }
}
