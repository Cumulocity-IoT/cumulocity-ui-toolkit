import { OperationStatus } from '@c8y/client';
import { AlertService, OperationRealtimeService } from '@c8y/ngx-components';
import { Subject } from 'rxjs';
import { OperationAlert, OperationToastService } from './operation-toast.service';

describe('OperationToastService', () => {
  it('adds operation alert and emits only matching completed updates', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/unbound-method
    const stream = new Subject<any>();
    const alertService = {
      add: jest.fn(),
      remove: jest.fn(),
    } as unknown as AlertService;
    const operationRealtime = {
      onUpdate$: jest.fn(() => stream.asObservable()),
    } as unknown as OperationRealtimeService;
    const service = new OperationToastService(alertService, operationRealtime);

    const alert: OperationAlert = {
      text: 'running',
      type: 'info',
      operationDetails: { deviceId: 'd1', uuid: 'u1' },
    };
    const next = jest.fn();

    service.add(alert).subscribe(next);
    stream.next({ status: OperationStatus.EXECUTING, uuid: 'u1' });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    stream.next({ status: OperationStatus.SUCCESSFUL, uuid: 'u1', description: 'ok', param: 'p' });

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(alertService.add).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ status: OperationStatus.SUCCESSFUL, uuid: 'u1' })
    );
  });

  it('removes alert and realtime subscription by uuid', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/unbound-method
    const stream = new Subject<any>();
    const sub = { unsubscribe: jest.fn(), closed: false };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-argument
    jest.spyOn(stream, 'subscribe').mockReturnValue(sub as any);

    const alertService = {
      add: jest.fn(),
      remove: jest.fn(),
    } as unknown as AlertService;
    const operationRealtime = {
      onUpdate$: jest.fn(() => stream.asObservable()),
    } as unknown as OperationRealtimeService;
    const service = new OperationToastService(alertService, operationRealtime);

    const alert: OperationAlert = {
      text: 'running',
      type: 'info',
      operationDetails: { deviceId: 'd1', uuid: 'u2' },
    };

    service.add({ ...alert });
    service.remove(alert);

    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(alertService.remove).toHaveBeenCalledWith(alert);
    expect(sub.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
