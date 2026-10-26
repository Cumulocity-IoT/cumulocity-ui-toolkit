import { TestBed } from '@angular/core/testing';
import { InventoryService } from '@c8y/client';
import { provideMock } from '~helpers/auto-mock.helper';
import { SMART_VIEW_CONFIGURATION_TYPE, SmartViewConfigurationDraft } from '../smart-views.model';
import { SmartViewConfigurationService } from './smart-view-configuration.service';

describe('SmartViewConfigurationService', () => {
  let service: SmartViewConfigurationService;
  let inventory: jasmine.SpyObj<InventoryService>;

  const draft: SmartViewConfigurationDraft = {
    name: 'Turbines',
    icon: 'wind',
    assetDefinitionId: '42',
    assetDefinitionName: 'c8y_WindTurbine',
    columns: [{ name: 'name', path: 'name', header: 'Name' }],
    priority: 700,
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideMock(InventoryService)] });
    service = TestBed.inject(SmartViewConfigurationService);
    inventory = TestBed.inject(InventoryService) as jasmine.SpyObj<InventoryService>;
  });

  it('lists configurations by type', async () => {
    inventory.list.and.resolveTo({ data: [{ id: '1' }] } as never);

    const result = await service.listConfigurations();

    expect(result.length).toBe(1);
    expect(inventory.list).toHaveBeenCalledWith(
      jasmine.objectContaining({ type: SMART_VIEW_CONFIGURATION_TYPE })
    );
  });

  it('creates a configuration with a query derived from the asset definition and notifies', async () => {
    inventory.create.and.resolveTo({ data: { id: '7' } } as never);
    const changed = jasmine.createSpy('changed');

    service.configurationsChanged$.subscribe(changed);

    await service.create(draft);

    const body = inventory.create.calls.mostRecent().args[0] as Record<string, any>;

    expect(body.type).toBe(SMART_VIEW_CONFIGURATION_TYPE);
    expect(body.name).toBe('Turbines');
    expect(body.c8y_SmartViewConfiguration.query).toBe(
      "(type eq 'c8y_WindTurbine') and has(c8y_IsAsset)"
    );
    expect(body.c8y_SmartViewConfiguration.priority).toBe(700);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it('updates by id and notifies', async () => {
    inventory.update.and.resolveTo({ data: { id: '7' } } as never);
    const changed = jasmine.createSpy('changed');

    service.configurationsChanged$.subscribe(changed);

    await service.update('7', draft);

    expect(inventory.update).toHaveBeenCalledWith(jasmine.objectContaining({ id: '7' }));
    expect(changed).toHaveBeenCalled();
  });

  it('deletes by id and notifies', async () => {
    inventory.delete.and.resolveTo({} as never);
    const changed = jasmine.createSpy('changed');

    service.configurationsChanged$.subscribe(changed);

    await service.delete('7');

    expect(inventory.delete).toHaveBeenCalledWith('7');
    expect(changed).toHaveBeenCalled();
  });
});
