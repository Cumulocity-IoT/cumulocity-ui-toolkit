import { inject, Injectable } from '@angular/core';
import { isEqual } from 'lodash';
import { HelperService } from './helper.service';

@Injectable()
export class DragDropSeriesService {
  private helperService = inject(HelperService);

  createUpdatedIndexedCommandQueue(indexedCommandQueue, filtered) {
    const rearranged = Object.values(this.helperService.groupBy(indexedCommandQueue, 'index'));
    const temp: { index: string; commands: any }[] = rearranged.map((val, idx) => ({
      index: val[0].index as string,
      commands: val as any,
    }));

    const rearrIdxCmdQ = temp.map((entry, idx) => ({
      newIdx: filtered.find((val: any) => val.series.index === entry.index).newIdx,
      series: entry,
    }));

    const finalUpdatedIndexedCommandQueue = [];

    rearrIdxCmdQ.forEach((entry) => {
      entry.series.index = entry.newIdx;
    });

    rearrIdxCmdQ.forEach((entry) => {
      entry.series.commands.forEach((command) => (command.index = entry.newIdx));
    });

    const rearrangedCmdQ = rearrIdxCmdQ.map((entry) => entry.series);

    rearrangedCmdQ.forEach((entry) =>
      entry.commands.forEach((command) => finalUpdatedIndexedCommandQueue.push(command))
    );

    return finalUpdatedIndexedCommandQueue.sort((a, b) => Number(a.index) - Number(b.index));
  }

  createArrayOfSingleInstructions(indexedCommandQueue) {
    const arrayOfSingleInstructions = indexedCommandQueue.filter(
      (entry) => entry.index === 'single'
    );

    const arrayOfSingleInstructionObjects = [];

    arrayOfSingleInstructions.forEach((singleInstruction) => {
      const pos = indexedCommandQueue.findIndex((entry) => isEqual(entry, singleInstruction));

      arrayOfSingleInstructionObjects.push({
        instruction: singleInstruction,
        indexOfPrevious: pos,
      });
    });

    return arrayOfSingleInstructionObjects;
  }
}
