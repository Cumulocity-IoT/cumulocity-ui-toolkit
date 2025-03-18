import { Component, inject, Input, OnInit } from '@angular/core';
import { cloneDeep } from 'lodash';
import { Subscription } from 'rxjs';
import { IndexedCommandQueueEntry, MessageIds } from '../../models/command-queue.model';
import { ManagedObjectUpdateService } from '../../services/managed-object-update.service';
import { SimulatorSettingsService } from '../../services/simulator-settings.service';

@Component({
  selector: 'app-bulk-updates',
  templateUrl: './bulk-updates.component.html',
  styleUrl: './bulk-updates.component.scss',
})
export class BulkUpdatesComponent implements OnInit {
  private updateService = inject(ManagedObjectUpdateService);
  private simSettings = inject(SimulatorSettingsService);

  @Input() mo;

  mirroredAxis: boolean = false;
  intertwinedValues: boolean = false;
  randomizeValueType: 'All' | 'SmartRest' | 'Measurements' = 'All';
  allInstructionsSeries = [];
  instructionsSubscription: Subscription;
  indexedCommandQueue: IndexedCommandQueueEntry[] = [];
  saltValue: number;

  private commandQueueSubscription: Subscription;

  ngOnDestroy(): void {
    if (this.commandQueueSubscription) {
      this.commandQueueSubscription.unsubscribe();
    }
  }

  ngOnInit() {
    this.commandQueueSubscription = this.simSettings.indexedCommandQueueUpdate$.subscribe(
      (indexedCommandQueue: IndexedCommandQueueEntry[]) => {
        this.indexedCommandQueue = indexedCommandQueue;
      }
    );

    this.instructionsSubscription = this.simSettings.instructionsSeriesUpdate$.subscribe(
      (instructions) => {
        this.allInstructionsSeries = instructions;
      }
    );

    this.mirroredAxis = this.mo.c8y_mirroredAxis;
    this.intertwinedValues = this.mo.c8y_intertwinedValues;
    this.saltValue = this.mo.c8y_saltValue;
  }

  toggleMirrorYAxis() {
    this.mirroredAxis = !this.mirroredAxis;

    if (this.mirroredAxis) {
      for (let i = this.indexedCommandQueue.length - 1; i >= 0; i--) {
        const newEntry = cloneDeep(this.indexedCommandQueue[i]);

        newEntry.mirrored = true;
        this.indexedCommandQueue.push(newEntry);
      }
    } else {
      this.indexedCommandQueue = this.indexedCommandQueue.filter((element) => !element.mirrored);
    }

    this.simSettings.updateCommandQueueAndIndicesFromIndexedCommandQueue(this.indexedCommandQueue);

    this.updateService.mo.c8y_Series = this.simSettings.allInstructionsArray;
    this.updateService.mo.c8y_mirroredAxis = this.mirroredAxis;
    this.updateService.updateSimulatorObject(this.updateService.mo);
  }

  toggleIntertwineSeries() {
    this.intertwinedValues = !this.intertwinedValues;

    const indexDistribution: {
      iterations?: number;
      index: number;
      count: number;
      start?: number;
    }[] = [{ index: -1, count: -1 }];
    let newIndexedCommandQueue: IndexedCommandQueueEntry[] = [];
    const filteredCommandQueue = this.indexedCommandQueue.filter((a) => a.index === 'single');

    if (this.intertwinedValues === true) {
      let maxIndex = this.allInstructionsSeries.length + 1,
        numberOfTwines = 0,
        lastIndex = -1;

      if (maxIndex <= 2) {
        this.intertwinedValues = false;
        this.updateService.simulatorUpdateFeedback(
          'info',
          'You need at least two series to intertwine.'
        );

        return;
      }

      //Prepare Structure to intertwine
      for (const entry of this.allInstructionsSeries) {
        let count = 1; //default number of instructions made by a series if nothing else is defined

        if (entry.steps) {
          count = +entry.steps + 1;
        }

        if (entry.numberOfSleeps) {
          count = +entry.numberOfSleeps;
        }

        if (entry.numberOfImportedInstructions) {
          count = +entry.numberOfImportedInstructions;
        }

        indexDistribution.push({ index: +entry.index, count: count, iterations: 0 });
        numberOfTwines += count;
      }

      let startPosition = 0;

      for (const entry of this.indexedCommandQueue) {
        if (+entry.index !== lastIndex) {
          for (const distributed of indexDistribution) {
            if (distributed.index === +entry.index) {
              distributed.start = startPosition;
            }
          }
          lastIndex = +entry.index;
        }
        startPosition++;
      }

      indexDistribution.sort((a, b) => b.count - a.count);

      // Actual intertwine / rearrange of the array
      for (let i = 0; i < numberOfTwines; i++) {
        for (const distributed of indexDistribution) {
          if (distributed.count <= 0) {
            continue;
          }
          newIndexedCommandQueue.push(
            cloneDeep(this.indexedCommandQueue[distributed.iterations + distributed.start])
          );
          distributed.count--;
          distributed.iterations++;
        }
      }
      newIndexedCommandQueue = newIndexedCommandQueue.concat(filteredCommandQueue);
    } else {
      newIndexedCommandQueue = this.indexedCommandQueue;
      newIndexedCommandQueue.sort((a, b) => {
        return +a.index - +b.index;
      });
    }

    this.simSettings.updateCommandQueueAndIndicesFromIndexedCommandQueue(newIndexedCommandQueue);

    this.updateService.mo.c8y_Series = this.simSettings.allInstructionsArray;
    this.updateService.mo.c8y_intertwinedValues = this.intertwinedValues;
    this.updateService.updateSimulatorObject(this.updateService.mo);
  }

  addSomeSalt() {
    for (let entry of this.indexedCommandQueue) {
      //removes old salt if possible
      if (entry.deviation && entry.deviation.length > 0) {
        for (let i = 0; i < entry.values.length; i++) {
          const number = entry.values[i];

          if (number && !Number.isNaN(+number)) {
            entry.values[i] = String(+number - entry.deviation.shift());
          }
        }
      }

      delete entry.deviation;

      //calculates new salt and adds it
      if (entry.index !== 'single' && !entry.deviation && this.saltValue > 0) {
        if (
          ((this.randomizeValueType === 'All' || this.randomizeValueType === 'Measurements') &&
            entry.messageId == MessageIds.Measurement) ||
          ((this.randomizeValueType === 'All' || this.randomizeValueType === 'SmartRest') &&
            entry.templateId)
        ) {
          entry = this.calculateTheDeviation(entry);
        }
      }
    }

    this.simSettings.updateCommandQueueAndIndicesFromIndexedCommandQueue(this.indexedCommandQueue);

    this.updateService.mo.c8y_Series = this.simSettings.allInstructionsArray;
    this.updateService.mo.c8y_saltValue = this.saltValue;
    this.updateService.updateSimulatorObject(this.updateService.mo);
  }

  calculateTheDeviation(entry: IndexedCommandQueueEntry) {
    for (let i = 0; i < entry.values.length; i++) {
      const number = entry.values[i];

      if (number && !Number.isNaN(+number)) {
        const percentValue = Math.abs(+number * (this.saltValue / 100));
        const deviation = this.randomInterval(-percentValue, percentValue, 2);

        if (!entry.deviation) {
          entry.deviation = [deviation];
        } else {
          entry.deviation.push(deviation);
        }

        entry.values[i] = String(+number + deviation);
      }
    }

    return entry;
  }

  randomInterval(min: number, max: number, maxDigits: number): number {
    const random = (Math.random() * (max * 100 - min * 100 + 1) + min * 100) / 100;

    return this.numberOfDigitsAfterComma(random, maxDigits);
  }

  numberOfDigitsAfterComma(input: number, maxDigits: number): number {
    const powerOfDigits = Math.pow(10, maxDigits);
    return Math.round(input * powerOfDigits) / powerOfDigits;
  }
}
