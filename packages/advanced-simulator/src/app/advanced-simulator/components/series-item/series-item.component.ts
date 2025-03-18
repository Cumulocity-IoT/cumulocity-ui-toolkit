import { Component, inject, Input, OnInit, TemplateRef } from '@angular/core';
import {
  SeriesAlarmsForm,
  SeriesBasicEventsForm,
  SeriesEventsForm,
  SeriesMeasurementsForm,
  SeriesSleepForm,
} from '../../constants/input-fields.const';
import { CommandQueueEntry, IndexedCommandQueueEntry } from '../../models/command-queue.model';
import { FormState } from '../../models/formstate.model';
import { InputField } from '../../models/input-fields.model';
import {
  InstructionCategory,
  SeriesInstruction,
  SmartRestConfiguration,
} from '../../models/instruction.model';
import { CustomSimulator } from '../../models/simulator.model';
import { SmartRESTConfiguration } from '../../models/smart-rest.model';
import { InstructionService } from '../../services/Instruction.service';
import { ManagedObjectUpdateService } from '../../services/managed-object-update.service';
import { SimulatorSettingsService } from '../../services/simulator-settings.service';
import { SmartRESTService } from '../../services/smart-rest.service';
import { cloneDeep } from 'lodash';

@Component({
  selector: 'app-series-item',
  templateUrl: './series-item.component.html',
  styleUrls: ['./series-item.component.scss'],
})
export class SeriesItemComponent implements OnInit {
  private instructionService = inject(InstructionService);
  private simSettingsService = inject(SimulatorSettingsService);
  private updateService = inject(ManagedObjectUpdateService);
  private smartRestService = inject(SmartRESTService);

  @Input() header: TemplateRef<any>;
  @Input() isExpanded: boolean;
  @Input() smartRestConfig: SmartRestConfiguration;
  @Input() id: number | string;
  @Input() index: number;
  @Input() commandQueue: CommandQueueEntry[];
  @Input() mo: CustomSimulator;

  @Input() set series(value: SeriesInstruction) {
    this.selectedSeries = value;
    this.selectedConfig = this.selectedSeries.type;
    this.instructionValue = value;
    this.setLabelsForSelected();
  }

  get series() {
    return this.selectedSeries;
  }

  selectedSeries: SeriesInstruction;
  selectedConfig: string;
  instructionValue: SeriesInstruction;
  isSmartRestSelected = false;
  smartRestSelectedConfig: SmartRESTConfiguration;
  smartRestInstruction;
  form;
  icon: string;
  measurementOptions = ['linear', 'random', 'wave'];
  allInstructionsSeries: SeriesInstruction[];
  indexedCommandQueue: IndexedCommandQueueEntry[];
  defaultFormState = FormState.PRISTINE;
  formState = this.defaultFormState;

  ngOnInit() {
    this.allInstructionsSeries = this.simSettingsService.allInstructionsArray;
  }

  setLabelsForSelected() {
    switch (this.selectedSeries.type) {
      case 'Measurement':
        this.icon = 'sliders';
        this.form = SeriesMeasurementsForm;
        break;
      case 'Alarm':
        this.icon = 'bell';
        this.form = SeriesAlarmsForm;
        break;
      case 'Sleep':
        this.icon = 'clock-o';
        this.form = SeriesSleepForm;
        break;
      case 'BasicEvent':
        this.icon = 'tasks';
        this.form = SeriesBasicEventsForm;
        break;
      case 'LocationUpdateEvent':
        this.icon = 'globe';
        this.form = SeriesEventsForm;
        break;
      case 'SmartRest':
        this.icon = 'sitemap';
        this.smartRestSelectedConfig = this.selectedSeries.config;
        this.smartRestInstruction = this.selectedSeries.instruction;
        this.form = this.instructionService.createSmartRestDynamicForm(this.smartRestInstruction);
        break;
    }
  }

  duplicateSeries() {
    const duplicated = cloneDeep(this.selectedSeries);

    this.allInstructionsSeries = this.simSettingsService.allInstructionsArray;
    duplicated.index = this.allInstructionsSeries.length.toString();

    const indexOfSeries = duplicated.index;

    this.indexedCommandQueue = this.simSettingsService.indexedCommandQueue;
    this.allInstructionsSeries.push(duplicated);

    if (this.instructionValue.type !== InstructionCategory.SmartRest) {
      this.instructionService.pushToSeriesArrays(duplicated.type, duplicated);

      const template = this.simSettingsService.generateRequest();

      template.map((entry) => (entry.index = indexOfSeries));
      this.indexedCommandQueue.push(...template);
    } else if (this.selectedSeries.type === InstructionCategory.SmartRest) {
      const smartRestInstructionsArray = this.smartRestService.convertToSmartRestModel(
        duplicated.instruction,
        duplicated.config
      );
      const cmdQ = this.smartRestService.generateSmartRestRequest(
        smartRestInstructionsArray,
        this.selectedSeries.config
      );
      const indexedCmdQ = cmdQ.map((entry) => ({
        ...entry,
        index: indexOfSeries,
      })) as IndexedCommandQueueEntry[];

      this.indexedCommandQueue.push(...indexedCmdQ);
    }

    this.simSettingsService.updateCommandQueueAndIndicesFromIndexedCommandQueue(
      this.indexedCommandQueue
    );
    this.simSettingsService.setAllInstructionsSeries(this.allInstructionsSeries);

    this.updateService.updateSimulatorObject(this.updateService.mo).then((res) => {
      this.updateService.simulatorUpdateFeedback('success', 'Series successfully duplicated.');
    });
  }

  deleteSeries() {
    this.indexedCommandQueue = this.simSettingsService.indexedCommandQueue;
    this.allInstructionsSeries = this.simSettingsService.allInstructionsArray;

    const indexOfItem = +this.selectedSeries.index;
    const filtered = this.indexedCommandQueue.filter(
      (entry: IndexedCommandQueueEntry) => +entry.index !== +indexOfItem
    );

    this.simSettingsService.updateCommandQueueAndIndicesFromIndexedCommandQueue(filtered);
    this.allInstructionsSeries = this.allInstructionsSeries.filter(
      (entry) => entry.index !== this.selectedSeries.index
    );
    this.simSettingsService.setAllInstructionsSeries(this.allInstructionsSeries);

    this.updateService.updateSimulatorObject(this.updateService.mo).then((res) => {
      const alertText = `Series has been deleted succesfully.`;

      this.updateService.simulatorUpdateFeedback('success', alertText);
    });
  }

  buttonHandler(inputField: InputField) {
    this.instructionValue = this.simSettingsService.buttonHandler(
      inputField,
      this.instructionValue,
      this.allInstructionsSeries
    ) as SeriesInstruction;
  }

  updateSeries() {
    this.simSettingsService.randomSelected =
      this.selectedSeries.type === InstructionCategory.Measurement ||
      this.selectedSeries.type === InstructionCategory.SmartRest
        ? this.selectedSeries.scalingOption
        : null;

    this.indexedCommandQueue = this.simSettingsService.indexedCommandQueue;

    const indexOfSeries = this.selectedSeries.index;
    const itemPos = this.indexedCommandQueue.findIndex((entry) => entry.index === indexOfSeries);

    this.indexedCommandQueue = this.indexedCommandQueue.filter(
      (entry) => entry.index !== indexOfSeries
    );

    if (this.instructionValue.type === InstructionCategory.Measurement) {
      this.simSettingsService.randomSelected = this.selectedSeries.scalingOption;
      this.instructionService.pushToSeriesArrays(this.instructionValue.type, this.instructionValue);

      const template = this.simSettingsService.generateRequest();

      template.map((entry) => (entry.index = indexOfSeries));
      this.indexedCommandQueue.splice(itemPos, 0, ...template);
    } else if (this.selectedSeries.type === InstructionCategory.SmartRest) {
      this.smartRestService.smartRestOption = this.selectedSeries.scalingOption;

      const smartRestInstructionsArray = this.smartRestService.convertToSmartRestModel(
        this.selectedSeries.instruction,
        this.selectedSeries.config
      );
      const cmdQ = this.smartRestService.generateSmartRestRequest(
        smartRestInstructionsArray,
        this.selectedSeries.config
      );
      const indexedCmdQ = cmdQ.map((entry) => ({
        ...entry,
        index: indexOfSeries,
      })) as IndexedCommandQueueEntry[];

      this.indexedCommandQueue.splice(itemPos, 0, ...indexedCmdQ);
    }

    this.simSettingsService.updateCommandQueueAndIndicesFromIndexedCommandQueue(
      this.indexedCommandQueue
    );

    this.updateService.updateSimulatorObject(this.updateService.mo).then((res) => {
      const alertText = `Series has been updated successfully.`;

      this.updateService.simulatorUpdateFeedback('success', alertText);
      this.formState = this.defaultFormState;
    });
  }

  inputChange(event: Event): FormState {
    // FIXME use form-element and provided form-state
    this.formState = FormState.TOUCHED;

    return this.formState;
  }
}
