import { Component, EventEmitter, inject, Input, Output, TemplateRef } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { Alert, AlertService } from '@c8y/ngx-components';
import { cloneDeep } from 'lodash';
import { BsModalService } from 'ngx-bootstrap/modal';
import { COLORS_REDUCED } from '../../../constants/colors.const';
import {
  DefaultConfig,
  SeriesAlarmsForm,
  SeriesBasicEventsForm,
  SeriesEventsForm,
  SeriesMeasurementsForm,
  SeriesSleepForm,
} from '../../../constants/input-fields.const';
import { CommandQueueEntry, IndexedCommandQueueEntry } from '../../../models/command-queue.model';
import { InputField } from '../../../models/input-fields.model';
import { InstructionCategory, SeriesInstruction } from '../../../models/instruction.model';
import { InstructionService } from '../../../services/Instruction.service';
import { ManagedObjectUpdateService } from '../../../services/managed-object-update.service';
import { SimulatorSettingsService } from '../../../services/simulator-settings.service';
import { SmartRESTService } from '../../../services/smart-rest.service';
import { SaveSimulatorTemplateDialog } from './save-simulator-template-dialog/save-simulator-template-dialog.component';
import { SimulatorFileUploadDialog } from './simulator-file-upload-dialog/simulator-file-upload-dialog.component';

@Component({
  selector: 'app-sim-settings',
  templateUrl: './sim-settings.component.html',
  styleUrls: ['./sim-settings.component.scss'],
})
export class SimSettingsComponent {
  private simSettingsService = inject(SimulatorSettingsService);
  private smartRestService = inject(SmartRESTService);
  private alertService = inject(AlertService);
  private updateService = inject(ManagedObjectUpdateService);
  private instructionService = inject(InstructionService);
  private modalService = inject(BsModalService);
  private sanitizer = inject(DomSanitizer);

  @Input() header: TemplateRef<any>;
  @Input() isExpanded: boolean;
  @Input() smartRestConfig; // FIXME set type (and default)
  @Input() id: string;
  @Input() commandQueue: CommandQueueEntry[];
  @Input() allInstructionsSeries;
  @Input() mo; // FIXME set type (and default)
  @Output() allSeriesEmitter = new EventEmitter();

  reducedColors = COLORS_REDUCED;
  selectedColor: string = '#fff';
  defaultConfig: InstructionCategory[] = DefaultConfig;
  assignedIndex: string;
  allForms = [
    SeriesMeasurementsForm,
    SeriesAlarmsForm,
    SeriesBasicEventsForm,
    SeriesEventsForm,
    SeriesSleepForm,
  ];

  measurementOptions = ['linear', 'random', 'wave'];
  smartRestInstruction = {};
  smartRestArr = [];
  selectedConfig = '';
  instructionValue: Partial<SeriesInstruction> = {};
  selectedSeries: SeriesInstruction;
  templateCtx: { item: SeriesInstruction };
  isSmartRestSelected = false;
  smartRestViewModel = {};
  randomize = false;
  selected = { entryName: '', selected: false };
  validationInstruction: Partial<SeriesInstruction> = {};
  disableBtn = true;
  smartRestOption = 'linear';
  measurementOption = 'linear';
  importUrl: SafeResourceUrl;
  smartRestSelectedConfig = '';
  smartRestAllValues: {
    minIncrement?: string;
    maxIncrement?: string;
    minimum?: string;
    maximum?: string;
    unit?: string;
  } = {};

  updateSeries(index: number) {
    const isNumArr = this.allForms[index].filter((entry) => entry.isNumber);
    const pos = isNumArr.findIndex((val) => isNaN(Number(this.instructionValue[val.name])));

    if (pos !== -1) {
      this.updateService.simulatorUpdateFeedback(
        'danger',
        'Please fill in numbers for Minimum, Maximum and steps.'
      );
    } else {
      for (const entry of this.allForms[index]) {
        if (entry.defaultValue && !this.instructionValue[entry.name]) {
          this.instructionValue[entry.name] = entry.defaultValue;
        }

        if (!entry.hidden && entry.required === true && !this.instructionValue[entry.name]) {
          this.alertService.add({
            text: `Not all the required fields are filled.`,
            type: 'danger',
          });

          return;
        }

        if (+entry.minimum > this.instructionValue[entry.name]) {
          this.alertService.add({
            text: `For ${entry.name} you need a value greater than or equal to ${entry.minimum}.`,
            type: 'danger',
          });

          return;
        }
      }

      this.instructionValue.color = this.selectedColor;
      this.instructionValue.type = this.defaultConfig[index];
      this.instructionService.pushToSeriesArrays(this.defaultConfig[index], this.instructionValue);

      const assignedIndex: string = this.allInstructionsSeries.length.toString();
      const insVal = cloneDeep(this.instructionValue);

      this.simSettingsService.pushToInstructionsArray({
        ...insVal,
        index: assignedIndex,
        scalingOption: this.measurementOption,
      } as SeriesInstruction);
      this.generateRequest();
    }
  }

  changeAllSmartRestValues() {
    let currentMinIncrement = 0;
    let currentMaxIncrement = 0;

    for (const entry of this.smartRestSelectedConfig.smartRestFields.customValues) {
      if (this.smartRestAllValues.minimum && entry.path.includes('value')) {
        this.smartRestInstruction[entry.path + '_min'] = String(
          +this.smartRestAllValues.minimum + currentMinIncrement
        );

        if (this.smartRestAllValues.maxIncrement) {
          currentMaxIncrement += +this.smartRestAllValues.maxIncrement;
        }
      }

      if (this.smartRestAllValues.maximum && entry.path.includes('value')) {
        this.smartRestInstruction[entry.path + '_max'] = String(
          +this.smartRestAllValues.maximum + currentMaxIncrement
        );

        if (this.smartRestAllValues.minIncrement) {
          currentMinIncrement += +this.smartRestAllValues.minIncrement;
        }
      }

      if (this.smartRestAllValues.unit && entry.path.includes('unit')) {
        this.smartRestInstruction[entry.path] = this.smartRestAllValues.unit;
      }
    }
  }

  buttonHandler(inputField: InputField) {
    this.instructionValue = this.simSettingsService.buttonHandler(
      inputField,
      this.instructionValue,
      this.allInstructionsSeries
    );
  }

  onSelectFocus(value) {
    this.selected = { entryName: value, selected: false };
  }

  onSelectBlur() {
    this.selected.selected = true;
  }

  onChangeConfig(value) {
    this.isSmartRestSelected = value === InstructionCategory.SmartRest;
  }

  openSimulatorUploadFileDialog() {
    this.modalService.show(SimulatorFileUploadDialog);
  }

  openSimulatorTemplateModal() {
    this.modalService.show(SaveSimulatorTemplateDialog);
  }

  downloadSimulator() {
    const { id, ...nonId } = this.updateService.mo.c8y_DeviceSimulator;
    const simulatorToImport = (({
      type,
      owner,
      name,
      c8y_CustomSim,
      c8y_additionals,
      c8y_Series,
    }) => ({
      type,
      owner,
      name,
      c8y_CustomSim,
      c8y_additionals,
      c8y_Series,
    }))(this.updateService.mo);

    simulatorToImport['c8y_DeviceSimulator'] = nonId;
    const simulator = JSON.stringify(simulatorToImport);
    const blob = new Blob([simulator as BlobPart], {
      type: 'application/octet-stream',
    });

    this.importUrl = this.sanitizer.bypassSecurityTrustResourceUrl(
      window.URL.createObjectURL(blob)
    );
  }

  saveSmartRestTemplateToCommandQueue() {
    this.smartRestService.smartRestOption =
      this.smartRestOption != '' ? this.smartRestOption : 'linear';
    const smartRestInstructionsArray = this.smartRestService.convertToSmartRestModel(
      this.smartRestInstruction,
      this.smartRestSelectedConfig
    );

    let entryFieldsWithInconsistentTypes = [];
    const entriesWithMinMaxOrSteps = Object.keys(this.smartRestInstruction).filter((entry) =>
      entry.includes('_min' || '_max' || 'steps')
    );

    if (entriesWithMinMaxOrSteps.length) {
      entryFieldsWithInconsistentTypes = entriesWithMinMaxOrSteps.filter((entry) =>
        isNaN(Number(this.smartRestInstruction[entry]))
      );
    }

    if (entryFieldsWithInconsistentTypes.length) {
      this.updateService.simulatorUpdateFeedback(
        'danger',
        'Please fill in numbers for minimum, maximum and steps'
      );
    } else {
      const copySmartRestInstruction = cloneDeep(this.smartRestInstruction);
      const copySmartRestSelectedConfig = cloneDeep(this.smartRestSelectedConfig);
      const smartRestCommandQueue = this.smartRestService.generateSmartRestRequest(
        smartRestInstructionsArray,
        this.smartRestSelectedConfig
      );

      const indexed = this.simSettingsService.indexedCommandQueue;
      const index = this.allInstructionsSeries.length.toString();
      const combinedSmartInstruction: SeriesInstruction = {
        instruction: copySmartRestInstruction,
        type: InstructionCategory.SmartRest,
        config: copySmartRestSelectedConfig,
        index: index,
        scalingOption: this.smartRestOption,
      };

      this.simSettingsService.pushToInstructionsArray(combinedSmartInstruction);

      const indexedCmdQ = smartRestCommandQueue.map((entry) => ({
        ...entry,
        index: index,
      })) as IndexedCommandQueueEntry[];

      indexed.push(...indexedCmdQ);
      this.simSettingsService.updateCommandQueueAndIndicesFromIndexedCommandQueue(indexed);
      this.updateService.mo.c8y_Series = this.simSettingsService.allInstructionsArray;

      this.updateService.updateSimulatorObject(this.updateService.mo).then((res) => {
        const alert = {
          text: `Smart REST instructions created successfully.`,
          type: 'success',
        } as Alert;

        this.alertService.add(alert);
        this.allSeriesEmitter.emit(res.c8y_Series);
        this.simSettingsService.allInstructionsArray = res.c8y_Series;
        Object.entries(this.smartRestInstruction).forEach(([key, value]) => {
          this.smartRestInstruction[key] = '';
        });
        this.smartRestService.resetCommandQueueArray();
        this.smartRestArr = [];
        this.smartRestSelectedConfig = '';
        Object.keys(this.smartRestInstruction).forEach(
          (key) => delete this.smartRestInstruction[key]
        );
        this.simSettingsService.resetUsedArrays();
        this.smartRestInstruction = {};
        this.selectedConfig = '';
        this.isSmartRestSelected = false;
      });
    }
  }

  clearSeries() {
    this.selected.selected = false;
    this.instructionValue = {};
    this.smartRestInstruction = {};
  }

  private generateRequest() {
    this.instructionValue['scalingOption'] = this.measurementOption;
    this.simSettingsService.randomSelected =
      this.instructionValue.type === 'Measurement' && this.instructionValue.scalingOption
        ? this.instructionValue.scalingOption
        : 'linear';
    const instructionSet = this.simSettingsService.generateInstructions();

    this.updateService.mo.c8y_DeviceSimulator.commandQueue = instructionSet;
    this.updateService.mo.c8y_Series = this.simSettingsService.allInstructionsArray;

    this.updateService.updateSimulatorObject(this.updateService.mo).then((res) => {
      this.updateService.simulatorUpdateFeedback(
        'success',
        `${this.instructionValue.type} series has been added successfully.`
      );
      Object.keys(this.instructionValue).forEach((key) => (this.instructionValue[key] = ''));
      this.selectedConfig = '';
      Object.keys(this.instructionValue).forEach((key) => delete this.instructionValue[key]);
      this.simSettingsService.resetUsedArrays();
      this.simSettingsService.setAllInstructionsSeries(res.c8y_Series);
      this.selectedColor = '#fff';
    });
  }
}
