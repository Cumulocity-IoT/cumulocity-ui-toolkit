import { Injectable } from '@angular/core';
import { AlarmInstruction } from '../models/instruction.model';

@Injectable()
export class AlarmsService {
  alarms: AlarmInstruction[] = [];

  pushToAlarms(alarms: AlarmInstruction) {
    this.alarms.push(alarms);
  }
}
