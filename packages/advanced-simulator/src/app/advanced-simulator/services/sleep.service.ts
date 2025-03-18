import { Injectable } from '@angular/core';

@Injectable()
export class SleepService {
  sleeps = [];

  pushToSleeps(sleep) {
    this.sleeps.push(sleep);
  }
}
