import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component, inject, Input } from '@angular/core';
import { Subscription } from 'rxjs';
import { IndexedCommandQueueEntry } from '../../../models/command-queue.model';
import { SeriesInstruction } from '../../../models/instruction.model';
import { DragDropSeriesService } from '../../../services/drag-drop-series.service';
import { ManagedObjectUpdateService } from '../../../services/managed-object-update.service';
import { SimulatorSettingsService } from '../../../services/simulator-settings.service';

@Component({
  selector: 'app-series-list',
  templateUrl: './series-list.component.html',
  styleUrl: './series-list.component.scss',
})
export class SeriesListComponent {
  private simSettingsService = inject(SimulatorSettingsService);
  private dragDropService = inject(DragDropSeriesService);
  private updatedService = inject(ManagedObjectUpdateService);

  @Input() set instructionsSeries(instructionsArray) {
    this.allInstructionsSeries = instructionsArray;
  }

  get instructionsSeries() {
    return this.allInstructionsSeries;
  }

  @Input() set indexedCommandQueue(indexed: IndexedCommandQueueEntry[]) {
    this.idxdCmdQueue = indexed;
  }

  get indexedCommandQueue() {
    return this.idxdCmdQueue;
  }

  allInstructionsSeries; // FIXME set type
  idxdCmdQueue: IndexedCommandQueueEntry[];

  private instructionsSeriesSubscription: Subscription;

  ngOnDestroy() {
    if (this.instructionsSeriesSubscription) {
      this.instructionsSeriesSubscription.unsubscribe();
    }
  }

  drop(event: CdkDragDrop<SeriesInstruction[]>) {
    moveItemInArray(this.instructionsSeries, event.previousIndex, event.currentIndex);

    const filtered = this.instructionsSeries.map((entry, idx) => ({
      newIdx: idx.toString(),
      series: entry,
    }));

    const filteredIndexedCommandQueue = this.indexedCommandQueue.filter(
      (entry) => entry.index !== 'single'
    );
    const rearranged = this.dragDropService.createUpdatedIndexedCommandQueue(
      filteredIndexedCommandQueue,
      filtered
    );

    const singleInstructions = this.dragDropService.createArrayOfSingleInstructions(
      this.indexedCommandQueue
    );

    if (singleInstructions.length) {
      singleInstructions.forEach((entry) => {
        rearranged.splice(entry.indexOfPrevious, 0, entry.instruction);
      });
    }

    filtered.forEach((entry) => (entry.series.index = entry.newIdx));

    const updatedInstructionsSeries = filtered.map(({ newIdx, ...nonIdx }) => nonIdx.series);

    this.indexedCommandQueue = rearranged;
    this.instructionsSeries = updatedInstructionsSeries;
    this.simSettingsService.updateCommandQueueAndIndicesFromIndexedCommandQueue(
      this.indexedCommandQueue
    );
    this.simSettingsService.setAllInstructionsSeries(updatedInstructionsSeries);
    this.updatedService.updateSimulatorObject(this.updatedService.mo);
  }
}
