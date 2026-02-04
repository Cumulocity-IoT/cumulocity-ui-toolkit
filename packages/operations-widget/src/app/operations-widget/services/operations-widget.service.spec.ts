import { TestBed } from '@angular/core/testing';
import { OperationsWidgetService } from './operations-widget.service';
import { AlertService } from '@c8y/ngx-components';
import { OperationService } from '@c8y/client';
import { provideMock } from '../../../../../../libs/helpers/auto-mock.helper';

describe('OperationsWidgetService', () => {
  let service: OperationsWidgetService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        OperationsWidgetService,
        provideMock(OperationService),
        provideMock(AlertService),
      ],
    });

    service = TestBed.inject(OperationsWidgetService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
