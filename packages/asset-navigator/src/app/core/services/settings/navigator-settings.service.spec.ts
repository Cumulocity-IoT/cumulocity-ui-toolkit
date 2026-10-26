import { TestBed } from '@angular/core/testing';
import { InventoryService, UserService } from '@c8y/client';
import { AppStateService } from '@c8y/ngx-components';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_SETTINGS, SETTINGS_FRAGMENT, SETTINGS_MO_TYPE } from './navigator-settings.model';
import { NavigatorSettingsService } from './navigator-settings.service';

describe('NavigatorSettingsService', () => {
  let users: jasmine.SpyObj<UserService>;
  let inventory: jasmine.SpyObj<InventoryService>;

  function setup(customProperties: Record<string, unknown> = {}): NavigatorSettingsService {
    users = jasmine.createSpyObj<UserService>('UserService', ['current', 'updateCurrent']);
    users.current.and.resolveTo({ data: { userName: 'jane', customProperties } } as never);
    users.updateCurrent.and.resolveTo({ data: {} } as never);
    inventory = jasmine.createSpyObj<InventoryService>('InventoryService', [
      'list',
      'create',
      'update',
    ]);
    inventory.list.and.resolveTo({ data: [] } as never);
    inventory.create.and.resolveTo({ data: { id: '77' } } as never);
    inventory.update.and.resolveTo({ data: { id: '77' } } as never);
    TestBed.configureTestingModule({
      providers: [
        { provide: UserService, useValue: users },
        { provide: InventoryService, useValue: inventory },
        {
          provide: AppStateService,
          useValue: { currentUser: new BehaviorSubject({ userName: 'jane' }) },
        },
      ],
    });

    return TestBed.inject(NavigatorSettingsService);
  }

  describe('platform user', () => {
    it('reads the settings from the user and writes them back, keeping other custom properties', async () => {
      const service = setup({
        language: 'de',
        [SETTINGS_FRAGMENT]: { showSearch: false, maxRecent: 3 },
      });

      await service.load();
      expect(service.storage()).toBe('user');
      expect(service.settings()).toEqual({ ...DEFAULT_SETTINGS, showSearch: false, maxRecent: 3 });

      await service.update({ inventoryFallback: false });
      expect(users.updateCurrent).toHaveBeenCalledWith({
        customProperties: jasmine.objectContaining({
          language: 'de',
          [SETTINGS_FRAGMENT]: jasmine.objectContaining({
            inventoryFallback: false,
            showSearch: false,
          }),
        }),
      });
      expect(inventory.create).not.toHaveBeenCalled();
    });

    it('keeps the defaults when reading fails', async () => {
      const service = setup();

      users.current.and.rejectWith(new Error('network'));
      await service.load();
      expect(service.settings()).toEqual(DEFAULT_SETTINGS);
    });

    it('moves to the settings object when the user may not update itself', async () => {
      const service = setup();

      users.updateCurrent.and.rejectWith(new Error('403'));
      await service.load();
      await service.update({ maxPinned: 3 });
      expect(service.storage()).toBe('inventory');
      expect(inventory.create).toHaveBeenCalledWith(
        jasmine.objectContaining({
          type: SETTINGS_MO_TYPE,
          [SETTINGS_FRAGMENT]: jasmine.objectContaining({ maxPinned: 3 }),
        })
      );
    });
  });

  describe('SSO user', () => {
    it('creates its settings object on the first change, then updates it', async () => {
      const service = setup({ userOrigin: 'OAUTH2' });

      await service.load();
      expect(service.storage()).toBe('inventory');
      expect(inventory.list).toHaveBeenCalledWith(
        jasmine.objectContaining({ type: SETTINGS_MO_TYPE, owner: 'jane' })
      );

      await service.update({ showSearch: false });
      expect(inventory.create).toHaveBeenCalledWith(
        jasmine.objectContaining({
          type: SETTINGS_MO_TYPE,
          [SETTINGS_FRAGMENT]: jasmine.objectContaining({ showSearch: false }),
        })
      );
      await service.update({ maxPinned: 4 });
      expect(inventory.update).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id: '77',
          [SETTINGS_FRAGMENT]: jasmine.objectContaining({ maxPinned: 4 }),
        })
      );
      expect(users.updateCurrent).not.toHaveBeenCalled();
    });

    it('reads the newest settings object of the user', async () => {
      const service = setup({ userOrigin: 'OAUTH2' });

      inventory.list.and.resolveTo({
        data: [
          { id: '1', lastUpdated: '2026-01-01T00:00:00Z', [SETTINGS_FRAGMENT]: { maxPinned: 2 } },
          { id: '2', lastUpdated: '2026-06-01T00:00:00Z', [SETTINGS_FRAGMENT]: { maxPinned: 5 } },
        ],
      } as never);
      await service.load();
      expect(service.settings().maxPinned).toBe(5);
    });
  });
});
