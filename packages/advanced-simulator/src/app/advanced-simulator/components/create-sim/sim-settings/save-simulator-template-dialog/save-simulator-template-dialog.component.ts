import { Component, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { ILabels } from '../../../../models/labels.model';
import { C8YDeviceSimulator } from '../../../../models/simulator.model';
import { TemplateModel } from '../../../../models/template.model';
import { ManagedObjectUpdateService } from '../../../../services/managed-object-update.service';
import { SimulatorsServiceService } from '../../../../services/simulators-service.service';

@Component({
  selector: 'save-simulator-template-dialog',
  templateUrl: './save-simulator-template-dialog.component.html',
})
export class SaveSimulatorTemplateDialog {
  private simulatorService = inject(SimulatorsServiceService);
  private updateService = inject(ManagedObjectUpdateService);

  labels: ILabels = {
    ok: 'Save',
    cancel: 'Cancel',
  };

  modalTitle = 'Save template';
  templateName: string;
  deviceSimulator: C8YDeviceSimulator;
  closeSubject: Subject<any> = new Subject();
  // files: File[];

  onDismiss() {
    this.closeSubject.next(undefined);
  }

  onClose(event) {
    this.closeSubject.next(event);
  }

  createSimulatorTemplateWithName() {
    const deviceSimulator = this.updateService.mo.c8y_DeviceSimulator;

    deviceSimulator.name = '';
    deviceSimulator.state = 'PAUSED';
    deviceSimulator.id = '';

    const template: Partial<TemplateModel> = {
      name: this.templateName,
      c8y_SimulatorTemplate: {},
      c8y_Template: {
        c8y_DeviceSimulator: deviceSimulator,
        c8y_additionals: this.updateService.mo.c8y_additionals,
        c8y_Series: this.updateService.mo.c8y_Series,
      },
    };

    this.simulatorService.createSimulatorTemplate(template).then((res) => {
      this.updateService.simulatorUpdateFeedback(
        'success',
        'Template has been created successfully'
      );
    });
  }
}
