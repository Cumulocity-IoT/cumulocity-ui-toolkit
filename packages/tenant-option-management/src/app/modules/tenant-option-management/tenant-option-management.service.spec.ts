import { TestBed } from '@angular/core/testing';
import { TenantOptionManagementService } from './tenant-option-management.service';
import { AlertService } from '@c8y/ngx-components';
import { InventoryService, TenantOptionsService } from '@c8y/client';
import { provideMock } from '../../../../../../libs/helpers/auto-mock.helper';

describe('TenantOptionManagementService', () => {
  let service: TenantOptionManagementService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        TenantOptionManagementService,
        provideMock(InventoryService),
        provideMock(TenantOptionsService),
        provideMock(AlertService),
      ],
    });

    service = TestBed.inject(TenantOptionManagementService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
