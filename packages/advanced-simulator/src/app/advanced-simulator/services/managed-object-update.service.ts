import { inject, Injectable } from '@angular/core';
import { Alert, AlertService } from '@c8y/ngx-components';
import { AdditionalParameter, CommandQueueEntry } from '../models/command-queue.model';
import { SeriesInstruction } from '../models/instruction.model';
import { CustomSimulator } from '../models/simulator.model';
import { TemplateModel } from '../models/template.model';
import { SimulatorsServiceService } from './simulators-service.service';

@Injectable()
export class ManagedObjectUpdateService {
  private simService = inject(SimulatorsServiceService);
  private alertService = inject(AlertService);

  mo: CustomSimulator;
  templateMO: TemplateModel;

  setManagedObject(mo: CustomSimulator): void {
    this.mo = mo;
  }

  updateSimulatorObject(mo: CustomSimulator): Promise<CustomSimulator> {
    return this.simService.updateSimulatorManagedObject(mo);
  }

  updateMOCommandQueueAndIndices(
    commandQueue: CommandQueueEntry[],
    additionals: AdditionalParameter[]
  ): void {
    this.mo.c8y_DeviceSimulator.commandQueue = commandQueue;
    this.mo.c8y_additionals = additionals;
  }

  updateMOInstructionsArray(instructionsArray: SeriesInstruction[]): void {
    this.mo.c8y_Series = instructionsArray;
  }

  simulatorUpdateFeedback(type: string, text: string): void {
    const alert = {
      text: text,
      type: type,
    } as Alert;

    this.alertService.add(alert);
  }

  updateTemplateObject(templateMO: TemplateModel): Promise<TemplateModel> {
    return this.simService.updateTemplateManagedObject(templateMO);
  }
}
