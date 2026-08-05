import { inject, Injectable } from '@angular/core';
import {
  AlarmService,
  EventService,
  IAlarm,
  IEvent,
  IManagedObject,
  IOperation,
  IResult,
  OperationService,
} from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import {
  AlarmAction,
  EventAction,
  OperationAction,
  PopoverAction,
} from '../layered-map-widget.model';

@Injectable()
export class PopoverActionService {
  private operationService = inject(OperationService);
  private alarmService = inject(AlarmService);
  private eventService = inject(EventService);
  private alert = inject(AlertService);

  send(action: PopoverAction, mo: IManagedObject) {
    switch (action.type) {
      case 'alarm':
        return this.addToast(action, this.sendAlarm(action, mo));
      case 'event':
        return this.addToast(action, this.sendEvent(action, mo));
      case 'operation':
        return this.addToast(action, this.sendOperation(action, mo));
    }
  }

  protected addToast<T>(action: PopoverAction, promise: Promise<IResult<T>>) {
    return promise.then(
      () => this.alert.success(`${action.label} successful`),
      (error) => this.alert.danger(`${action.label} failed`, JSON.stringify(error))
    );
  }

  protected sendAlarm(action: AlarmAction, mo: IManagedObject) {
    const partial = action.body;

    // The action body is persisted widget configuration, so the fields the Alarm
    // API requires are not guaranteed to be present.
    if (!partial.severity || !partial.type || !partial.text) {
      return Promise.reject(
        new Error(`Alarm action "${action.label}" needs a severity, a type and a text.`)
      );
    }

    let newAlarm: IAlarm = {
      source: mo,
      time: new Date().toISOString(),
      severity: partial.severity,
      type: partial.type,
      text: partial.text,
    };

    // add potential custom fragments
    newAlarm = { ...newAlarm, ...partial };

    return this.alarmService.create(newAlarm);
  }

  protected sendEvent(action: EventAction, mo: IManagedObject) {
    const partial = action.body;

    if (!partial.type || !partial.text) {
      return Promise.reject(new Error(`Event action "${action.label}" needs a type and a text.`));
    }

    let newEvent: IEvent = {
      source: mo,
      time: new Date().toISOString(),
      type: partial.type,
      text: partial.text,
    };

    // add potential custom fragments
    newEvent = { ...newEvent, ...partial };

    return this.eventService.create(newEvent);
  }

  protected sendOperation(action: OperationAction, mo: IManagedObject) {
    const partial = action.body;
    let newOperation: IOperation = {
      deviceId: mo.id,
    };

    // add potential custom fragments
    newOperation = { ...newOperation, ...partial };

    return this.operationService.create(newOperation);
  }
}
