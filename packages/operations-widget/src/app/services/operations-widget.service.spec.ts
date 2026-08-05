import { TestBed } from '@angular/core/testing';
import { IFetchResponse, OperationService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { provideMock } from '~helpers/auto-mock.helper';
import { OperationButtonConfig } from '../models/operations-widget-config.model';
import { OperationsWidgetService } from './operations-widget.service';

describe('OperationsWidgetService', () => {
  let service: OperationsWidgetService;
  let operationService: jasmine.SpyObj<OperationService>;
  let alertService: jasmine.SpyObj<AlertService>;

  const mockButton: OperationButtonConfig = {
    label: 'Restart',
    description: 'Restart the device',
    operationFragment: 'c8y_Restart',
    operationValue: '{}',
    showModal: false,
  };

  const mockPayload = { deviceId: 'dev-1', c8y_Restart: {} };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OperationsWidgetService,
        provideMock(OperationService),
        provideMock(AlertService),
        provideMock(TranslateService),
      ],
    });

    service = TestBed.inject(OperationsWidgetService);
    operationService = TestBed.inject(OperationService) as jasmine.SpyObj<OperationService>;
    alertService = TestBed.inject(AlertService) as jasmine.SpyObj<AlertService>;

    // Resolve messages to "<key>|<interpolated label>" so the assertions can show
    // both the translated key and the value substituted into it.
    const translateService = TestBed.inject(TranslateService) as jasmine.SpyObj<TranslateService>;

    (translateService.instant as unknown as jasmine.Spy).and.callFake(
      (key: string, params?: Record<string, unknown>) =>
        params ? `${key}|${String(params['label'])}` : key
    );
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('createOperation()', () => {
    it('creates the operation with the button description merged in', async () => {
      operationService.create.and.returnValue(
        Promise.resolve({ data: {} as any, res: {} as IFetchResponse })
      );

      await service.createOperation(mockButton, mockPayload);

      expect(operationService.create).toHaveBeenCalledWith({
        ...mockPayload,
        description: mockButton.description,
      });
    });

    it('shows a success alert when the API call resolves', async () => {
      operationService.create.and.returnValue(
        Promise.resolve({ data: {} as any, res: {} as IFetchResponse })
      );

      await service.createOperation(mockButton, mockPayload);

      expect(alertService.success).toHaveBeenCalledWith(
        `Operation '{{ label }}' successfully created.|${mockButton.label}`
      );
    });

    it('shows a danger alert when the API call rejects', async () => {
      operationService.create.and.returnValue(Promise.reject(new Error('Network error')));

      await service.createOperation(mockButton, mockPayload);

      expect(alertService.danger).toHaveBeenCalledWith(
        `Failed to create '{{ label }}' operation.|${mockButton.label}`,
        jasmine.anything()
      );
    });

    it('does not propagate the rejection (swallows the error)', async () => {
      operationService.create.and.returnValue(Promise.reject(new Error('Network error')));

      await expectAsync(service.createOperation(mockButton, mockPayload as never)).toBeResolved();
    });
  });
});
