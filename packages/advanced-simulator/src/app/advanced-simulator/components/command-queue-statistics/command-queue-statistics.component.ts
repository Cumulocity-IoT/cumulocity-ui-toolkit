import { Component, inject, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import {
  CommandQueueEntry,
  IndexedCommandQueueEntry,
  MessageIds,
} from '../../models/command-queue.model';
import { SimulatorSettingsService } from '../../services/simulator-settings.service';

@Component({
  selector: 'app-command-queue-statistics',
  templateUrl: './command-queue-statistics.component.html',
  styleUrl: './command-queue-statistics.component.scss',
})
export class CommandQueueStatisticsComponent implements OnInit {
  private simSettings = inject(SimulatorSettingsService);

  time = { day: 24 * 60 * 60, hour: 60 * 60, minute: 60 };
  indexedCommandQueue: CommandQueueEntry[];
  runthroughsPerMinute: number = 0;
  runthroughsPerHour: number = 0;
  runthroughsPerDay: number = 0;
  timeForOneLoop: number = 0;
  measurementCategory = [];

  private commandQueueSubscription: Subscription;

  ngOnInit() {
    this.commandQueueSubscription = this.simSettings.indexedCommandQueueUpdate$.subscribe(
      (indexedCommandQueue: IndexedCommandQueueEntry[]) => {
        this.indexedCommandQueue = indexedCommandQueue;
        this.calculateInformationFromCommandQueue();
      }
    );
  }

  ngOnDestroy(): void {
    if (this.commandQueueSubscription) {
      this.commandQueueSubscription.unsubscribe();
    }
  }

  calculateInformationFromCommandQueue() {
    for (let i = 0; i < this.indexedCommandQueue.length; i++) {
      const entry = this.indexedCommandQueue[i];

      if (entry.type === 'sleep') {
        this.timeForOneLoop += +entry.seconds;
      }

      if (entry.messageId === MessageIds.Measurement) {
        const identifier = entry.values[0] + ' ' + entry.values[1];
        const find = this.measurementCategory.find((a) => a.identifier === identifier);

        if (find) {
          find.value += +entry.values[2];
          find.avg += +entry.values[2];

          if (+entry.values[2] > find.highest) {
            find.highest = +entry.values[2];
          }

          if (+entry.values[2] < find.lowest) {
            find.highest = +entry.values[2];
          }
        } else {
          this.measurementCategory.push({
            highest: 0,
            lowest: 0,
            identifier: identifier,
            value: +entry.values[2],
            unit: entry.values[3],
            avg: +entry.values[2],
          });
        }
      }
    }

    this.runthroughsPerMinute = this.roundTwoDecimals(this.time.minute / this.timeForOneLoop);
    this.runthroughsPerHour = this.roundTwoDecimals(this.time.hour / this.timeForOneLoop);
    this.runthroughsPerDay = this.roundTwoDecimals(this.time.day / this.timeForOneLoop);

    for (const entry of this.measurementCategory) {
      entry.runthroughsPerMinute = +entry.value * this.runthroughsPerMinute;
      entry.runthroughsPerHour = +entry.value * this.runthroughsPerHour;
      entry.runthroughsPerDay = +entry.value * this.runthroughsPerDay;

      for (const key in entry) {
        if (isNaN(entry[key]) == false) {
          entry[key] = this.roundTwoDecimals(entry[key]);
        }
      }
    }
  }

  roundTwoDecimals(toRound: number) {
    return Math.round(toRound * 100) / 100;
  }
}
