import { inject, Injectable } from '@angular/core';
import { IOperation, OperationStatus } from '@c8y/client';
import { Alert, AlertService, OperationRealtimeService } from '@c8y/ngx-components';
import { Subscription, filter } from 'rxjs';

export interface OperationAlert extends Alert {
  operationDetails: {
    deviceId: string;
    uuid: string;
  };
}
@Injectable()
export class OperationToastService {
  private realtimeSubscriptions = new Map<string, Subscription>();
  /**
   * The alerts actually handed to the `AlertService`, keyed by operation uuid.
   * These are copies without `operationDetails`, so removal has to go through
   * this cache — `AlertService` compares by object identity.
   */
  private alertsCache = new Map<string, Alert>();

  private alertService = inject(AlertService);

  private operationRealtime = inject(OperationRealtimeService);

  add(alert: OperationAlert) {
    const { deviceId, uuid } = alert.operationDetails;
    // Copy rather than mutate: the caller keeps its `operationDetails` so that
    // `remove()` can still resolve the uuid and tear the subscription down.
    const { operationDetails: _operationDetails, ...toast } = alert;

    this.alertsCache.set(uuid, toast);
    this.alertService.add(toast);

    this.subscribe(uuid, deviceId);

    return this.operationRealtime.onUpdate$(deviceId).pipe(
      filter((o) => {
        return (
          (o.status === OperationStatus.SUCCESSFUL || o.status === OperationStatus.FAILED) &&
          o['uuid'] === uuid
        );
      })
    );
  }

  remove(alert: OperationAlert) {
    const uuid = alert.operationDetails?.uuid;
    const toast = uuid ? this.alertsCache.get(uuid) : undefined;

    this.alertService.remove(toast ?? alert);

    if (uuid) {
      this.alertsCache.delete(uuid);
      this.unsubscribe(uuid);
    }
  }

  private handleRealtimeElement(operation: IOperation) {
    const uuid = operation['uuid'] as string;
    const alert = this.alertsCache.get(uuid);

    if (alert) {
      this.alertService.remove(alert);
    }

    const text = operation['description'] as string;

    let detailedData = '';

    if (operation.status === OperationStatus.FAILED) {
      // text += `<br /><a href="/apps/devicemanagement/index.html#/device/${operation.deviceId}/operations" target="_blank">Go to operation details</a>`;
      detailedData = operation['failureReason'] as string;
    } else {
      detailedData = operation['param'] as string;
    }

    this.alertService.add({
      type: operation.status === OperationStatus.SUCCESSFUL ? 'success' : 'danger',
      text: text,
      detailedData,
      allowHtml: true,
    });

    // first need to remove from cache and then check for unsubscribe!
    this.alertsCache.delete(uuid);
    this.unsubscribe(uuid);
  }

  /**
   * Creates an operation realtime listener for a device.
   * @param deviceId
   * @param uuid
   * @returns
   */
  private subscribe(uuid: string, deviceId: string): void {
    if (this.realtimeSubscriptions.has(uuid)) {
      // already subscribed
      return;
    }

    const sub = this.operationRealtime
      .onUpdate$(deviceId)
      .pipe(
        filter((o) => {
          return (
            (o.status === OperationStatus.SUCCESSFUL || o.status === OperationStatus.FAILED) &&
            o['uuid'] === uuid
          );
        })
      )
      .subscribe((o) => this.handleRealtimeElement(o));

    this.realtimeSubscriptions.set(uuid, sub);
  }

  /**
   * Cancels the listening to an operation channel.
   * @param uuid
   */
  private unsubscribe(uuid: string) {
    const sub = this.realtimeSubscriptions.get(uuid);

    if (sub) {
      sub.unsubscribe();
      this.realtimeSubscriptions.delete(uuid);
    }
  }
}
