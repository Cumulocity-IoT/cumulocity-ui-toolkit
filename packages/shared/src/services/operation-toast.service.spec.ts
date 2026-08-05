import { OperationStatus } from '@c8y/client';
import { AlertService, OperationRealtimeService } from '@c8y/ngx-components';
import { Subject } from 'rxjs';
import { OperationAlert, OperationToastService } from './operation-toast.service';
import { createService } from '~helpers/create-service.helper';

describe('OperationToastService', () => {
  it('adds operation alert and emits only matching completed updates', () => {
    const stream = new Subject<any>();
    const alertService = {
      add: jasmine.createSpy('add'),
      remove: jasmine.createSpy('remove'),
    } as unknown as AlertService;
    const operationRealtime = {
      onUpdate$: jasmine.createSpy('onUpdate$').and.returnValue(stream.asObservable()),
    } as unknown as OperationRealtimeService;
    const service = createService(OperationToastService, [
      { provide: AlertService, useValue: alertService },
      { provide: OperationRealtimeService, useValue: operationRealtime },
    ]);

    const alert: OperationAlert = {
      text: 'running',
      type: 'info',
      operationDetails: { deviceId: 'd1', uuid: 'u1' },
    };
    const next = jasmine.createSpy('next');

    service.add(alert).subscribe(next);
    stream.next({ status: OperationStatus.EXECUTING, uuid: 'u1' });
    stream.next({ status: OperationStatus.SUCCESSFUL, uuid: 'u1', description: 'ok', param: 'p' });

    expect(alertService.add).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(
      jasmine.objectContaining({ status: OperationStatus.SUCCESSFUL, uuid: 'u1' })
    );
  });

  it('removes alert and realtime subscription by uuid', () => {
    const stream = new Subject<any>();
    const sub = { unsubscribe: jasmine.createSpy('unsubscribe'), closed: false };

    spyOn(stream, 'subscribe').and.returnValue(sub as any);

    const alertService = {
      add: jasmine.createSpy('add'),
      remove: jasmine.createSpy('remove'),
    } as unknown as AlertService;
    const operationRealtime = {
      onUpdate$: jasmine.createSpy('onUpdate$').and.returnValue(stream.asObservable()),
    } as unknown as OperationRealtimeService;
    const service = createService(OperationToastService, [
      { provide: AlertService, useValue: alertService },
      { provide: OperationRealtimeService, useValue: operationRealtime },
    ]);

    const alert: OperationAlert = {
      text: 'running',
      type: 'info',
      operationDetails: { deviceId: 'd1', uuid: 'u2' },
    };

    service.add({ ...alert });
    service.remove(alert);

    // The alert handed to the AlertService is a copy without `operationDetails`;
    // removal has to target that exact object, not the caller's.
    const added = (alertService.add as jasmine.Spy).calls.mostRecent().args[0];

    expect(alertService.remove).toHaveBeenCalledWith(added);
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("does not strip operationDetails from the caller's alert", () => {
    const stream = new Subject<any>();
    const alertService = {
      add: jasmine.createSpy('add'),
      remove: jasmine.createSpy('remove'),
    } as unknown as AlertService;
    const operationRealtime = {
      onUpdate$: jasmine.createSpy('onUpdate$').and.returnValue(stream.asObservable()),
    } as unknown as OperationRealtimeService;
    const service = createService(OperationToastService, [
      { provide: AlertService, useValue: alertService },
      { provide: OperationRealtimeService, useValue: operationRealtime },
    ]);

    const alert: OperationAlert = {
      text: 'running',
      type: 'info',
      operationDetails: { deviceId: 'd1', uuid: 'u3' },
    };

    service.add(alert);

    expect(alert.operationDetails).toEqual({ deviceId: 'd1', uuid: 'u3' });
    const added = (alertService.add as jasmine.Spy).calls.mostRecent().args[0] as OperationAlert;

    expect(added.operationDetails).toBeUndefined();
  });
});
