import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, EventEmitter, inject, Input, OnInit, Output } from '@angular/core';
import { Subscription } from 'rxjs';
import { CommandQueueEntry, IndexedCommandQueueEntry } from '../../../models/command-queue.model';
import { EditedMeasurement } from '../../../models/edited-measurement.model';
import { ManagedObjectUpdateService } from '../../../services/managed-object-update.service';
import { SimulatorSettingsService } from '../../../services/simulator-settings.service';
import { UpdateInstructionsService } from '../../../services/update-instructions.service';

@Component({
  selector: 'app-show-instruction',
  templateUrl: './show-instruction.component.html',
  styleUrl: './show-instruction.component.scss',
})
export class ShowInstructionComponent implements OnInit {
  private service = inject(UpdateInstructionsService);
  private simSettings = inject(SimulatorSettingsService);
  private updateService = inject(ManagedObjectUpdateService);

  @Input() mo;
  @Output() currentValue = new EventEmitter<CommandQueueEntry>();
  @Output() currentCommandQueue = new EventEmitter();
  @Output() getInvalidSimulator = new EventEmitter<boolean>();
  indexedCommandQueue: IndexedCommandQueueEntry[] = [];
  editedValue: CommandQueueEntry;
  isInserted = false;
  showBtns = false;
  measurement: EditedMeasurement;
  invalidSimulator = false;
  warning: { message: string; title: string };

  private commandQueueSubscription: Subscription;

  ngOnInit() {
    this.commandQueueSubscription = this.simSettings.indexedCommandQueueUpdate$.subscribe(
      (indexedCommandQueue: IndexedCommandQueueEntry[]) => {
        this.indexedCommandQueue = indexedCommandQueue;
        this.checkIfAtLeastOneSleepIsSet();
      }
    );
  }

  ngOnDestroy(): void {
    if (this.commandQueueSubscription) {
      this.commandQueueSubscription.unsubscribe();
    }
  }

  checkIfAtLeastOneSleepIsSet() {
    for (const entry of this.indexedCommandQueue) {
      if (entry.seconds && +entry.seconds >= 5) {
        this.getInvalidSimulator.emit(false);
        this.invalidSimulator = false;
        this.warning = null;

        return;
      }
    }
    this.warning = {
      title: 'Invalid Simulator!',
      message: 'You need at least a 5 seconds sleep somewhere in the Instruction Queue.',
    };

    this.getInvalidSimulator.emit(true);
    this.invalidSimulator = true;
  }

  deleteMeasurementOrSleep(item: IndexedCommandQueueEntry) {
    const pos = this.indexedCommandQueue.findIndex((entry) => entry === item);

    // Remove series if item is last entry of series
    if (item.index !== 'single') {
      const indexedCommandQueueWithItemIndex = this.indexedCommandQueue.filter(
        (entry) => entry.index === item.index
      );

      if (
        indexedCommandQueueWithItemIndex.length &&
        indexedCommandQueueWithItemIndex.length === 1
      ) {
        const updatedInstructionsArray = this.simSettings.allInstructionsArray.filter(
          (series) => series.index !== item.index
        );

        this.simSettings.setAllInstructionsSeries(updatedInstructionsArray);
      }
    }

    this.indexedCommandQueue.splice(pos, 1);
    this.currentCommandQueue.emit(this.indexedCommandQueue);
    this.simSettings.updateCommandQueueAndIndicesFromIndexedCommandQueue(this.indexedCommandQueue);

    this.updateService.updateSimulatorObject(this.updateService.mo).then((res) => {
      const alertText = `Instruction deleted successfully!`;

      this.updateService.simulatorUpdateFeedback('success', alertText);
      this.checkIfAtLeastOneSleepIsSet();
      this.simSettings.setIndexedCommandQueueUpdate();
    });
  }

  updateCurrentValue(value) {
    this.editedValue = value;
    this.currentValue.emit(value);
  }

  fetchAddInstructionsOrSleepView() {
    this.service.setInstructionsView(true);
  }

  drop(event: CdkDragDrop<IndexedCommandQueueEntry[]>) {
    moveItemInArray(this.indexedCommandQueue, event.previousIndex, event.currentIndex);

    this.simSettings.updateCommandQueueAndIndicesFromIndexedCommandQueue(this.indexedCommandQueue);
    this.updateService.updateSimulatorObject(this.updateService.mo);
  }
}
