import { TestBed } from '@angular/core/testing';
import { AlertService } from '@c8y/ngx-components';
import { IconSelectorService } from '@c8y/ngx-components/icon-selector';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { DtmService } from '~services/dtm.service';
import { SmartViewConfigurationService } from '../../services/smart-view-configuration.service';
import type { AssetDefinition, SmartViewConfiguration } from '../../smart-views.model';
import { CreateSmartViewConfigurationModalComponent } from './create-smart-view-configuration-modal.component';

const STORED = {
  id: '7',
  name: 'Pumps',
  c8y_SmartViewConfiguration: {
    icon: 'pump',
    query: "name eq 'P*'",
    columns: [{ name: 'name', path: 'name', header: 'Name' }],
    assetDefinitionId: '42',
    assetDefinitionName: 'c8y_Pump',
    priority: 500,
  },
} as unknown as SmartViewConfiguration;

describe('CreateSmartViewConfigurationModalComponent', () => {
  let configurations: jasmine.SpyObj<SmartViewConfigurationService>;
  let dtm: jasmine.SpyObj<DtmService>;
  let modal: CreateSmartViewConfigurationModalComponent;

  function create(configuration?: SmartViewConfiguration) {
    const fixture = TestBed.createComponent(CreateSmartViewConfigurationModalComponent);

    fixture.componentInstance.configuration = configuration;
    fixture.componentInstance.ngOnInit();

    return fixture.componentInstance;
  }

  beforeEach(() => {
    configurations = jasmine.createSpyObj<SmartViewConfigurationService>(
      'SmartViewConfigurationService',
      ['listAssetDefinitions', 'create', 'update']
    );
    configurations.update.and.resolveTo(STORED);
    dtm = jasmine.createSpyObj<DtmService>('DtmService', [
      'getAssetDefinition',
      'getPropertyDefinitions',
    ]);
    TestBed.configureTestingModule({
      imports: [CreateSmartViewConfigurationModalComponent],
      providers: [
        { provide: BsModalRef, useValue: { hide: jasmine.createSpy('hide') } },
        {
          provide: AlertService,
          useValue: jasmine.createSpyObj('AlertService', ['success', 'danger']),
        },
        { provide: SmartViewConfigurationService, useValue: configurations },
        { provide: IconSelectorService, useValue: {} },
        { provide: DtmService, useValue: dtm },
      ],
    }).overrideComponent(CreateSmartViewConfigurationModalComponent, {
      set: { imports: [], template: '' },
    });
  });

  it('keeps the stored query when a view is renamed before the definitions loaded', async () => {
    configurations.listAssetDefinitions.and.returnValue(new Promise(() => undefined));
    modal = create(STORED);
    modal.name = 'Pumps (renamed)';

    await modal.onClose();

    const draft = configurations.update.calls.mostRecent().args[1];

    expect(draft.assetDefinitionName).toBe('c8y_Pump');
    expect(draft.query).toBe("name eq 'P*'");
  });

  it('builds a new query when the definition changed', async () => {
    configurations.listAssetDefinitions.and.resolveTo([
      { id: '43', name: 'c8y_Valve' } as AssetDefinition,
    ]);
    dtm.getAssetDefinition.and.rejectWith(new Error('no DTM'));
    modal = create(STORED);
    await new Promise((resolve) => setTimeout(resolve));
    modal.assetDefinitionId = '43';

    await modal.onClose();

    const draft = configurations.update.calls.mostRecent().args[1];

    expect(draft.assetDefinitionName).toBe('c8y_Valve');
    expect(draft.query).toBeUndefined();
  });

  it("cannot save while the selected definition is unknown — no `type eq ''` query", () => {
    configurations.listAssetDefinitions.and.resolveTo([]);
    modal = create();
    modal.name = 'New view';
    modal.assetDefinitionId = '99';

    expect(modal.isValid).toBeFalse();
  });

  it('applies the columns of the definition selected last, whatever answers first', async () => {
    const answers = new Map<string, () => void>();

    configurations.listAssetDefinitions.and.resolveTo([
      { id: 'A', name: 'defA' } as AssetDefinition,
      { id: 'B', name: 'defB' } as AssetDefinition,
    ]);
    dtm.getAssetDefinition.and.callFake(
      (name: string) =>
        new Promise((resolve) =>
          answers.set(name, () =>
            resolve({
              composition: { allowedProperties: [{ identifier: `${name}_prop` }] },
            } as never)
          )
        )
    );
    dtm.getPropertyDefinitions.and.callFake((ids: string[]) =>
      Promise.resolve(
        ids.map((identifier) => ({ identifier, jsonSchema: { title: identifier } })) as never
      )
    );
    modal = create();
    await new Promise((resolve) => setTimeout(resolve));

    modal.assetDefinitionId = 'A';
    modal.onAssetDefinitionChange();
    modal.assetDefinitionId = 'B';
    modal.onAssetDefinitionChange();

    answers.get('defB')!();
    await new Promise((resolve) => setTimeout(resolve));
    answers.get('defA')!();
    await new Promise((resolve) => setTimeout(resolve));

    expect(modal.columns.map((column) => column.name)).toContain('defB_prop');
    expect(modal.columns.map((column) => column.name)).not.toContain('defA_prop');
  });
});
