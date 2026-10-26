import { TestBed } from '@angular/core/testing';
import { AlertService } from '@c8y/ngx-components';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { provideMock } from '~helpers/auto-mock.helper';
import { TenantOptionRow } from '../tenant-option-management.model';
import { TenantOptionManagementService } from '../tenant-option-management.service';
import { ImportOptionModalComponent } from './import-option-modal.component';

function row(overrides: Partial<TenantOptionRow> = {}): TenantOptionRow {
  return {
    id: 'cat-key',
    category: 'cat',
    key: 'key',
    value: 'v',
    ...overrides,
  };
}

describe('ImportOptionModalComponent', () => {
  let component: ImportOptionModalComponent;
  let optionsManagement: jasmine.SpyObj<TenantOptionManagementService>;
  let alertService: jasmine.SpyObj<AlertService>;
  let modalRef: { hide: jasmine.Spy };

  beforeEach(() => {
    modalRef = { hide: jasmine.createSpy('hide') };

    TestBed.configureTestingModule({
      imports: [ImportOptionModalComponent],
      providers: [
        provideMock(TenantOptionManagementService),
        provideMock(AlertService),
        { provide: BsModalRef, useValue: modalRef },
      ],
    }).overrideComponent(ImportOptionModalComponent, { set: { imports: [], template: '' } });

    component = TestBed.createComponent(ImportOptionModalComponent).componentInstance;
    optionsManagement = TestBed.inject(
      TenantOptionManagementService
    ) as jasmine.SpyObj<TenantOptionManagementService>;
    alertService = TestBed.inject(AlertService) as jasmine.SpyObj<AlertService>;
  });

  it('should be created', () => {
    expect(component).toBeTruthy();
  });

  describe('import() with a key set', () => {
    it('calls allowListOption and emits a single-item array', async () => {
      const single = row();

      component.option = { category: 'cat', key: 'key' };
      (optionsManagement.allowListOption as unknown as jasmine.Spy).and.resolveTo(single);

      const emitted: (TenantOptionRow[] | null)[] = [];

      component.closeSubject.subscribe((rows) => emitted.push(rows));

      component.import();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(optionsManagement.allowListOption).toHaveBeenCalledWith(component.option);
      expect(optionsManagement.allowListOptionsByCategory).not.toHaveBeenCalled();
      expect(emitted).toEqual([[single]]);
      expect(modalRef.hide).toHaveBeenCalled();
      expect(component.isLoading).toBeFalse();
    });
  });

  describe('import() with an empty key', () => {
    it('calls allowListOptionsByCategory and emits the returned rows', async () => {
      const rows = [row({ id: 'cat-a', key: 'a' }), row({ id: 'cat-b', key: 'b' })];

      component.option = { category: 'cat', key: '' };
      (optionsManagement.allowListOptionsByCategory as unknown as jasmine.Spy).and.resolveTo(rows);

      const emitted: (TenantOptionRow[] | null)[] = [];

      component.closeSubject.subscribe((r) => emitted.push(r));

      component.import();
      await Promise.resolve();
      await Promise.resolve();

      expect(optionsManagement.allowListOptionsByCategory).toHaveBeenCalledWith('cat');
      expect(optionsManagement.allowListOption).not.toHaveBeenCalled();
      expect(emitted).toEqual([rows]);
      expect(modalRef.hide).toHaveBeenCalled();
    });
  });

  describe('import() failure', () => {
    it('shows a danger alert and keeps the modal open when the category has no options', async () => {
      component.option = { category: 'empty-cat', key: '' };
      (optionsManagement.allowListOptionsByCategory as unknown as jasmine.Spy).and.rejectWith(
        new Error('No tenant options found for category "empty-cat"')
      );

      const emitted: (TenantOptionRow[] | null)[] = [];

      component.closeSubject.subscribe((rows) => emitted.push(rows));

      component.import();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(alertService.danger).toHaveBeenCalled();
      expect(modalRef.hide).not.toHaveBeenCalled();
      expect(emitted).toEqual([]);
      expect(component.isLoading).toBeFalse();
    });

    it('shows a danger alert on a generic API error for a single-key import', async () => {
      component.option = { category: 'cat', key: 'key' };
      (optionsManagement.allowListOption as unknown as jasmine.Spy).and.rejectWith(
        new Error('API error')
      );

      component.import();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(alertService.danger).toHaveBeenCalled();
      expect(modalRef.hide).not.toHaveBeenCalled();
    });
  });

  describe('close()', () => {
    it('emits null and hides the modal', () => {
      const emitted: (TenantOptionRow[] | null)[] = [];

      component.closeSubject.subscribe((rows) => emitted.push(rows));

      component.close();

      expect(emitted).toEqual([null]);
      expect(modalRef.hide).toHaveBeenCalled();
    });
  });
});
