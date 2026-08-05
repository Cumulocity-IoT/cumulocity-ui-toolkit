import { TestBed } from '@angular/core/testing';
import { TenantOptionsService } from '@c8y/client';
import { AlertService, ModalService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { provideMock } from '~helpers/auto-mock.helper';
import { ImportStatusEnum, TenantOptionImportRow } from '../tenant-option-management.model';
import { TenantOptionManagementService } from '../tenant-option-management.service';
import { FileImportModalComponent } from './file-import-modal.component';

function row(overrides: Partial<TenantOptionImportRow> = {}): TenantOptionImportRow {
  return {
    id: 'cat-key',
    category: 'cat',
    key: 'key',
    value: 'v',
    status: ImportStatusEnum.NEW,
    ...overrides,
  };
}

describe('FileImportModalComponent', () => {
  let component: FileImportModalComponent;
  let optionsManagement: jasmine.SpyObj<TenantOptionManagementService>;
  let alertService: jasmine.SpyObj<AlertService>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [FileImportModalComponent],
      providers: [
        provideMock(TenantOptionManagementService),
        provideMock(TenantOptionsService),
        provideMock(AlertService),
        provideMock(ModalService),
        provideMock(TranslateService),
        // `BsModalRef.hide` is assigned in its constructor, so autoMock cannot see it.
        { provide: BsModalRef, useValue: { hide: jasmine.createSpy('hide') } },
      ],
    }).overrideComponent(FileImportModalComponent, { set: { imports: [], template: '' } });

    component = TestBed.createComponent(FileImportModalComponent).componentInstance;
    optionsManagement = TestBed.inject(
      TenantOptionManagementService
    ) as jasmine.SpyObj<TenantOptionManagementService>;
    alertService = TestBed.inject(AlertService) as jasmine.SpyObj<AlertService>;

    (optionsManagement.addOption as unknown as jasmine.Spy).and.resolveTo({});
    (optionsManagement.updateOption as unknown as jasmine.Spy).and.resolveTo({});
    (optionsManagement.addOptionToConfiguration as unknown as jasmine.Spy).and.resolveTo({});
    (TestBed.inject(TranslateService).instant as unknown as jasmine.Spy).and.callFake(
      (key: string) => key
    );
  });

  describe('importOrUpdateItem() status transitions', () => {
    it('moves a NEW row to ADDED via addOption', async () => {
      const item = row({ status: ImportStatusEnum.NEW });

      component.rows = [item];

      await component.importOrUpdateItem(item);

      expect(optionsManagement.addOption).toHaveBeenCalled();
      expect(component.rows[0].status).toBe(ImportStatusEnum.ADDED);
    });

    it('moves an OVERWRITE row to UPDATED via updateOption', async () => {
      const item = row({ status: ImportStatusEnum.OVERWRITE });

      component.rows = [item];

      await component.importOrUpdateItem(item);

      expect(optionsManagement.updateOption).toHaveBeenCalled();
      expect(optionsManagement.addOption).not.toHaveBeenCalled();
      expect(component.rows[0].status).toBe(ImportStatusEnum.UPDATED);
    });

    /**
     * The option itself is already written at that point, so a failure to also
     * register it in the plugin configuration must not fail the import.
     */
    it('still reports UPDATED when configuration registration fails', async () => {
      (optionsManagement.addOptionToConfiguration as unknown as jasmine.Spy).and.rejectWith(
        new Error('already exists')
      );
      const item = row({ status: ImportStatusEnum.OVERWRITE });

      component.rows = [item];

      await component.importOrUpdateItem(item);

      expect(component.rows[0].status).toBe(ImportStatusEnum.UPDATED);
    });

    it('leaves the row untouched when it is not in the list', async () => {
      component.rows = [];

      await component.importOrUpdateItem(row());

      expect(optionsManagement.addOption).not.toHaveBeenCalled();
    });
  });

  describe('import()', () => {
    it('requires at least one selected item', async () => {
      component.selectedItems = [];

      await component.import();

      expect(alertService.danger).toHaveBeenCalled();
      expect(optionsManagement.addOption).not.toHaveBeenCalled();
    });

    it('imports every selected item and clears the loading flag', async () => {
      const a = row({ id: 'a', key: 'a' });
      const b = row({ id: 'b', key: 'b' });

      component.rows = [a, b];
      component.selectedItems = [a, b];

      await component.import();

      expect(optionsManagement.addOption).toHaveBeenCalledTimes(2);
      expect(component.isLoading).toBeFalse();
      expect(alertService.success).toHaveBeenCalled();
    });
  });

  describe('onItemsSelect()', () => {
    it('selects rows directly when none of them conflict', async () => {
      const a = row({ id: 'a', status: ImportStatusEnum.NEW });

      component.rows = [a];

      await component.onItemsSelect(['a']);

      expect(component.selectedItems).toEqual([a]);
    });

    it('marks confirmed conflicts as OVERWRITE', async () => {
      const conflicting = row({ id: 'c', status: ImportStatusEnum.CONFLICT });

      component.rows = [conflicting];
      (TestBed.inject(ModalService).confirm as unknown as jasmine.Spy).and.resolveTo(true);

      await component.onItemsSelect(['c']);

      expect(component.rows[0].status).toBe(ImportStatusEnum.OVERWRITE);
      expect(component.selectedItems.map((r) => r.id)).toEqual(['c']);
    });

    it('drops conflicting rows when the overwrite is declined', async () => {
      const conflicting = row({ id: 'c', status: ImportStatusEnum.CONFLICT });
      const fresh = row({ id: 'n', status: ImportStatusEnum.NEW });

      component.rows = [conflicting, fresh];
      (TestBed.inject(ModalService).confirm as unknown as jasmine.Spy).and.resolveTo(false);

      await component.onItemsSelect(['c', 'n']);

      expect(component.selectedItems.map((r) => r.id)).toEqual(['n']);
      expect(component.rows[0].status).toBe(ImportStatusEnum.CONFLICT);
    });
  });
});
