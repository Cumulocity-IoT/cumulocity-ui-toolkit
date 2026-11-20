import { TestBed } from '@angular/core/testing';
import { InventoryService, UserService } from '@c8y/client';
import { AppStateService } from '@c8y/ngx-components';
import { BehaviorSubject } from 'rxjs';
import { DEFAULT_SETTINGS, SETTINGS_FRAGMENT, SETTINGS_MO_TYPE } from './navigator-settings.model';
import { NavigatorSettingsService } from './navigator-settings.service';
import type { RollupSet } from './rollup.model';

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

  describe('detail fields', () => {
    const field = { label: 'Floor', source: { kind: 'property' as const, path: 'floor' } };

    it("writes a type's list into the stored settings, and resets it", async () => {
      const service = setup();

      await service.load();
      await service.setDetailFields('building', [field]);
      expect(service.settings().detailPanel.types).toEqual({ building: [field] });
      expect(users.updateCurrent).toHaveBeenCalledWith({
        customProperties: jasmine.objectContaining({
          [SETTINGS_FRAGMENT]: jasmine.objectContaining({
            detailPanel: jasmine.objectContaining({ types: { building: [field] } }),
          }),
        }),
      });

      await service.resetDetailFields('building');
      expect(service.settings().detailPanel.types).toEqual({});
    });

    it('edits and restores the default list', async () => {
      const service = setup();

      await service.load();
      await service.setDetailFields(null, [field]);
      expect(service.settings().detailPanel.default).toEqual([field]);
      await service.resetDetailFields(null);
      expect(service.settings().detailPanel).toEqual(DEFAULT_SETTINGS.detailPanel);
    });
  });

  describe('rollups and the tree filter', () => {
    const capacity: RollupSet = {
      fields: [{ label: 'Capacity', metric: { kind: 'property', path: 'capacity', fn: 'sum' } }],
      badge: 'property:sum:capacity',
    };

    it("writes a type's rollups into the stored settings, and resets them to the default", async () => {
      const service = setup();

      await service.load();
      await service.setRollups('farm', capacity);
      expect(service.settings().rollups.types).toEqual({ farm: capacity });
      expect(service.settings().rollups.default).toEqual(DEFAULT_SETTINGS.rollups.default);
      expect(users.updateCurrent).toHaveBeenCalledWith({
        customProperties: jasmine.objectContaining({
          [SETTINGS_FRAGMENT]: jasmine.objectContaining({
            rollups: jasmine.objectContaining({ types: { farm: capacity } }),
          }),
        }),
      });

      await service.resetRollups('farm');
      expect(service.settings().rollups.types).toEqual({});
    });

    it('edits and restores the default rollups, keeping the types and dot severities', async () => {
      const service = setup();

      await service.load();
      await service.setRollups('farm', capacity);
      await service.update({
        rollups: { ...service.settings().rollups, dotSeverities: ['critical'] },
      });
      await service.setRollups(null, { fields: [], badge: null });
      expect(service.settings().rollups.default).toEqual({ fields: [], badge: null });

      await service.resetRollups(null);
      expect(service.settings().rollups).toEqual({
        ...DEFAULT_SETTINGS.rollups,
        types: { farm: capacity },
        dotSeverities: ['critical'],
      });
    });

    it('resets everything — rollups and the tree filter included', async () => {
      const service = setup();

      await service.load();
      await service.setRollups('farm', capacity);
      await service.update({
        maxRecent: 3,
        treeFilter: {
          version: 1,
          enabled: true,
          conditions: [{ type: 'farm', test: { kind: 'unavailable' } }],
          hideEmpty: false,
        },
      });

      await service.reset();
      expect(service.settings()).toEqual(DEFAULT_SETTINGS);
      expect(users.updateCurrent).toHaveBeenCalledWith({
        customProperties: jasmine.objectContaining({
          [SETTINGS_FRAGMENT]: jasmine.objectContaining({
            rollups: DEFAULT_SETTINGS.rollups,
            treeFilter: DEFAULT_SETTINGS.treeFilter,
          }),
        }),
      });
    });
  });
  describe('concurrent changes', () => {
    it('creates one settings object for quick successive first changes (SSO users)', async () => {
      const service = setup({ userOrigin: 'OAUTH2' });
      let created!: () => void;

      inventory.create.and.returnValue(
        new Promise((resolve) => (created = () => resolve({ data: { id: '77' } } as never)))
      );
      await service.load();

      const first = service.update({ maxRecent: 3 });
      const second = service.update({ maxRecent: 4 });

      await Promise.resolve();
      created();
      await Promise.all([first, second]);

      expect(inventory.create).toHaveBeenCalledTimes(1);
      expect(inventory.update).toHaveBeenCalledWith(
        jasmine.objectContaining({
          id: '77',
          [SETTINGS_FRAGMENT]: jasmine.objectContaining({ maxRecent: 4 }),
        })
      );
    });

    it('stores the latest settings last, whatever order the requests take', async () => {
      const service = setup();
      const pending: (() => void)[] = [];

      users.updateCurrent.and.callFake(
        () => new Promise((resolve) => pending.push(() => resolve({ data: {} } as never)))
      );
      await service.load();

      const first = service.update({ maxRecent: 3 });
      const second = service.update({ maxRecent: 4 });

      // only one write may be on the wire at a time
      await new Promise((resolve) => setTimeout(resolve));
      expect(pending.length).toBe(1);
      pending.shift()!();
      await new Promise((resolve) => setTimeout(resolve));
      pending.shift()!();
      await Promise.all([first, second]);

      const lastWrite = users.updateCurrent.calls.mostRecent().args[0] as {
        customProperties: Record<string, { maxRecent: number }>;
      };

      expect(lastWrite.customProperties[SETTINGS_FRAGMENT].maxRecent).toBe(4);
    });

    it('keeps a change made before the stored settings arrived', async () => {
      const service = setup({ [SETTINGS_FRAGMENT]: { showSearch: false } });

      // the menu changes a setting while the stored settings are still being read
      const loading = service.load();

      await Promise.all([loading, service.update({ maxRecent: 3 })]);

      expect(service.settings().maxRecent).toBe(3);
      expect(service.settings().showSearch).toBeFalse();
    });
  });
});
