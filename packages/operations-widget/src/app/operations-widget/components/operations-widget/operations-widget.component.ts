import { Component, inject, Input, TemplateRef } from '@angular/core';
import { IOperation, IResult, OperationService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import {
  OperationButtonConfig,
  OperationParamConfig,
  OperationWidgetConfig,
} from '../../models/operations-widget-config.model';
import { BsModalRef, BsModalService } from 'ngx-bootstrap/modal';
import { FormGroup } from '@angular/forms';
import { FormlyFieldConfig } from '@ngx-formly/core';
@Component({
  selector: 'app-operations-widget',
  templateUrl: './operations-widget.component.html',
  styleUrls: ['./operations-widget.component.scss'],
  standalone: false,
})
export class OperationsWidgetComponent {
  private operationsService = inject(OperationService);
  private alertService = inject(AlertService);
  private modalService = inject(BsModalService);
  modalRef: BsModalRef;
  form = new FormGroup({});
  model: object = {};
  formlyFields: FormlyFieldConfig[] = [];

  @Input() config: OperationWidgetConfig = {};
  buttons: OperationButtonConfig[] = [];
  operationValue: Partial<IOperation> = {};
  selectedButton: OperationButtonConfig = null;
  previewPayload: string = '';
  payloadData: string = '';

  generateFormlyFields(button: OperationButtonConfig) {
    if (!button.fields) return;

    this.formlyFields = button.fields.map((field: OperationParamConfig) => {
      const fieldConfig: FormlyFieldConfig = {
        key: field.key,
        type: field.type,
        props: {
          label: field.label || field.key,
          required: true,
        },
      };

      // Special handling for Select/Dropdown
      if (field.type === 'select') {
        fieldConfig.type = 'select';
        fieldConfig.props.options = field.options.map((opt) => ({
          label: opt.label,
          value: opt.value,
        }));
      }
      // Special handling for Number (HTML input type)
      else if (field.type === 'number') {
        fieldConfig.type = 'input';
        fieldConfig.props.type = 'number';
      }
      // Default Text Input
      else {
        fieldConfig.type = 'input';
        fieldConfig.props.type = 'text';
      }

      return fieldConfig;
    });
  }

  async sendOperation() {
    this.selectedButton.operationValue = this.payloadData;
    this.modalRef.hide();
    await this.createOperation(this.selectedButton);
    this.selectedButton.operationValue = JSON.stringify(this.operationValue);
  }

  cancelOperation() {
    this.model = {};
    this.payloadData = '';
    this.previewPayload = '';
    this.modalRef.hide();
  }

  async onButtonClick(
    button: OperationButtonConfig,
    template: TemplateRef<unknown>
  ): Promise<void> {
    this.selectedButton = button;

    if (!this.config.device || !this.config.device.id) {
      this.alertService.danger(
        `No target device configured for this widget. Unable to create operation.`
      );

      return;
    }

    this.model = {};

    this.operationValue = JSON.parse(button.operationValue) as Partial<IOperation>;

    if (button.fields.length > 0) {
      this.generateFormlyFields(button);
      this.modalRef = this.modalService.show(template);
    } else {
      await this.createOperation(button);
    }
  }

  async createOperation(button: OperationButtonConfig): Promise<void> {
    let request: IResult<IOperation> | null = null;

    const operation: IOperation = {
      deviceId: this.config.device.id,
      [button.operationFragment]: this.selectedButton.operationValue || {},
      description: button.description,
    };

    operation.deviceId = this.config.device.id;

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

  onFormModelChange() {
    this.previewPayload = JSON.stringify(
      this.jsonArrayOrObject(this.operationValue, this.model) as unknown as string
    );
    this.payloadData = this.jsonArrayOrObject(this.operationValue, this.model) as unknown as string;
  }

  jsonArrayOrObject<T extends object>(existing: T | T[], newData: Partial<T>): T | T[] {
    // If it's an array, push the new data
    if (Array.isArray(existing)) {
      return [...existing, newData] as T[];
    }

    // If it's an object, merge properties
    if (existing !== null && typeof existing === 'object') {
      return { ...existing, ...newData } as T;
    }

    return existing;
  }
}
