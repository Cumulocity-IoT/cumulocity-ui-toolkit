import { Component, inject, Input } from '@angular/core';
import { IManagedObject } from '@c8y/client';
import { Alert, AlertService } from '@c8y/ngx-components';
import { DefaultConfig } from '../../../constants/input-fields.const';
import { IndexedCommandQueueEntry } from '../../../models/command-queue.model';
import {
  InstructionCategory,
  SeriesCSVInstruction,
  SmartInstruction,
  SmartRestInstruction,
} from '../../../models/instruction.model';
import { InstructionService } from '../../../services/instruction.service';
import { ManagedObjectUpdateService } from '../../../services/managed-object-update.service';
import { SimulatorSettingsService } from '../../../services/simulator-settings.service';
import { SimulatorsServiceService } from '../../../services/simulators-service.service';
import { cloneDeep } from 'lodash';

@Component({
  selector: 'app-csv-import',
  templateUrl: './csv-import.component.html',
  styleUrl: './csv-import.component.scss',
})
export class CsvImportComponent {
  private simSettingsService = inject(SimulatorSettingsService);
  private instructionService = inject(InstructionService);
  private updateService = inject(ManagedObjectUpdateService);
  private alertService = inject(AlertService);
  private simulatorervice = inject(SimulatorsServiceService);

  @Input() smartRestConfig;
  @Input() indexedCommandQueue: IndexedCommandQueueEntry[];
  @Input() allInstructionsSeries;

  instructionCategories: InstructionCategory[] = DefaultConfig;
  smartRestCategory: InstructionCategory = InstructionCategory.SmartRest;
  choosenInstructionCategory: InstructionCategory = this.smartRestCategory;
  step = 1;
  delimiter: string;
  data: string[][] = [];
  dataPoints: number;
  mappingsDone = 0;
  dataProperties: string[] = [];
  openCSVView = false;
  showMappedValues: boolean = false;
  smartRestSelectedConfig: any; // :any => smartresttemplates are highly flexible and you can't know what they include as key value pairs
  file: any; //same for csv file

  closeCSVModal(): void {
    this.openCSVView = false;
  }

  toggleShowMappedValues(): void {
    this.showMappedValues = !this.showMappedValues;
  }

  openCSVModal(): void {
    this.openCSVView = true;
    this.dataProperties = [];
    this.mappingsDone = 0;
    this.data = [];
    this.step = 1;
  }

  autoMapping(): void {
    let succeededMappings = 0;
    const checkedDataProperties = cloneDeep(this.dataProperties);
    const filteredCustomValues = this.smartRestSelectedConfig.smartRestFields.customValues.filter(
      (a) => !a.value
    );

    for (const smartRestField of filteredCustomValues) {
      for (let i = 0; i < checkedDataProperties.length; i++) {
        const csvProperty = checkedDataProperties[i];

        if (smartRestField.path.includes(csvProperty)) {
          smartRestField['csvProperty'] = csvProperty;
          smartRestField['csvValues'] = this.data[i];
          succeededMappings++;
          this.mappingsDone++;
          checkedDataProperties.splice(i, 1);
          this.data.splice(i, 1);
          break;
        }
      }
    }

    if (succeededMappings > 0) {
      this.successMessage(
        `${succeededMappings} of ${filteredCustomValues.length} successfully mapped`
      );
    } else {
      this.sendToast('No mappings possible', 'info');
    }
  }

  mapDataToSmartRest(smartRestField, csvProperty: string, i: number): void {
    smartRestField['csvProperty'] = csvProperty;
    smartRestField['csvValues'] = this.data[i];
    this.mappingsDone++;
  }

  goBack(): void {
    if (this.step > 1) {
      this.step--;
    }
  }

  incrementStep(): void {
    if (!this.validateInputFields()) {
      return;
    }

    this.step++;

    switch (this.step) {
      case 2:
        this.readFileStream();
        break;
      case 4:
        this.startImport();
        break;
    }
  }

  prepareFileStream(event): void {
    this.file = event.target.files[0];
  }

  private startImport(): void {
    const smartRestInstructions: SmartRestInstruction[] = [];
    const assignedIndex: string = this.allInstructionsSeries.length.toString();

    for (let i = 0; i < this.dataPoints; i++) {
      const smartRestInstruction = {
        type: InstructionCategory.SmartRest,
      } as SmartInstruction;

      for (const smartRestField of this.smartRestSelectedConfig.smartRestFields.customValues) {
        if (smartRestField.value !== null) {
          continue;
        }

        smartRestInstruction[smartRestField['path']] = '';

        if (smartRestField['csvValues']) {
          smartRestInstruction[smartRestField['path']] = smartRestField['csvValues'][i];
        }
      }

      smartRestInstructions.push(smartRestInstruction as SmartRestInstruction);

      const smartRestCommandQueueEntry = this.instructionService.smartRestInstructionToCommand(
        smartRestInstruction,
        this.smartRestSelectedConfig
      );

      const indexedCommandQueueEntry = { ...smartRestCommandQueueEntry, index: assignedIndex };

      this.indexedCommandQueue.push(indexedCommandQueueEntry);
      this.simSettingsService.updateCommandQueueAndIndicesFromIndexedCommandQueue(
        this.indexedCommandQueue
      );
      this.updateCommandQueueInManagedObject(this.updateService.mo);
      this.closeCSVModal();
    }

    this.simSettingsService.pushToInstructionsArray({
      index: assignedIndex,
      numberOfImportedInstructions: String(this.dataPoints),
      color: '#fff',
    } as SeriesCSVInstruction);

    this.updateService.mo.c8y_Series = this.simSettingsService.allInstructionsArray;

    this.updateService.updateSimulatorObject(this.updateService.mo).then((res) => {
      this.simSettingsService.setAllInstructionsSeries(res.c8y_Series);
    });
  }

  private updateCommandQueueInManagedObject(mo: IManagedObject): void {
    this.simulatorervice.updateSimulatorManagedObject(mo).then(
      () => {
        this.successMessage('Import was successful.');
      },
      () => {
        this.errorMessage('Import failed with an error.');
      }
    );
  }

  private sendToast(text: string, type: string): void {
    const alert = {
      text: text,
      type: type,
    } as Alert;

    this.alertService.add(alert);
  }

  private successMessage(text: string): void {
    this.sendToast(text, 'success');
  }

  private errorMessage(text: string): void {
    this.sendToast(text, 'danger');
  }

  private validateInputFields(): boolean {
    let valid = true;

    if (this.step === 1) {
      if (!this.delimiter || !this.file) {
        this.errorMessage(!this.delimiter ? 'Delimiter is not set.' : 'File is not uploaded.');
        valid = false;
      }
    }

    if (this.step === 2) {
      if (!this.choosenInstructionCategory || !this.smartRestSelectedConfig) {
        this.errorMessage(
          !this.choosenInstructionCategory
            ? 'Please select a category.'
            : 'Please select a Smartrest Template.'
        );
        valid = false;
      }
    }

    if (this.step === 3) {
      if (this.mappingsDone === 0) {
        this.errorMessage('Without any mappings no data will be imported');
        valid = false;
      }
    }

    return valid;
  }

  private readFileStream(): void {
    if (this.dataProperties && this.dataPoints) {
      return;
    }

    const fileReader = new FileReader();

    fileReader.onload = (e) => {
      const fileContent = String(fileReader.result);

      if (!fileContent.includes(this.delimiter)) {
        this.step--;
        this.errorMessage('Delimiter not found in CSV');

        return;
      }

      this.dataProperties = fileContent.split('\r\n')[0].split(this.delimiter);

      const data = fileContent.replace(/\r\n/g, ',').split(this.delimiter);

      for (let i = 0; i < this.dataProperties.length; i++) {
        this.data.push([]);

        for (let j = i; j < data.length; j += this.dataProperties.length) {
          if (j < this.dataProperties.length) {
            continue;
          }
          this.data[this.data.length - 1].push(data[j]);
        }
        this.dataPoints = this.data[this.data.length - 1].length;
      }
    };

    fileReader.readAsText(this.file);
  }
}
