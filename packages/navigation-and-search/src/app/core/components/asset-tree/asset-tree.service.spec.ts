import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { UserPreferencesService } from '@c8y/ngx-components';
import { of } from 'rxjs';
import { buildHierarchy, type RawManagedObject } from '../../services/asset-store/asset-rollup';
import { unitCount, type AssetHierarchy } from '../../services/asset-store/asset-store.model';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import { AssetTreeService } from './asset-tree.service';
import {
  DEFAULT_SETTINGS,
  type NavigatorSettings,
} from '../../services/settings/navigator-settings.model';
import type { TreeFilterConfig } from '../../services/settings/tree-filter.model';
import { NavigatorSettingsService } from '../../services/settings/navigator-settings.service';

const STATE_SYMBOL = Symbol.for('c8y-ps.asset-tree-state.v5');

describe('AssetTreeService', () => {
  let set: jasmine.Spy;
  let service: AssetTreeService;

  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[STATE_SYMBOL];
    set = jasmine.createSpy('set');
    TestBed.configureTestingModule({
      providers: [
        { provide: UserPreferencesService, useValue: { get: () => of(undefined), set } },
        { provide: AssetStoreService, useValue: {} },
        { provide: NavigatorSettingsService, useValue: { settings: () => DEFAULT_SETTINGS } },
      ],
    });
    service = TestBed.inject(AssetTreeService);
  });

  afterEach(() => delete (globalThis as Record<symbol, unknown>)[STATE_SYMBOL]);

  it('keeps a visit in the recents when storing the preference fails', async () => {
    set.and.rejectWith(new Error('forbidden'));
    // let the service's own preference load (started on construction) finish first
    await new Promise((resolve) => setTimeout(resolve));

    await expectAsync(service.touchRecent({ assetId: '42', label: 'Pump 7' })).toBeResolved();
    expect(service.recent().map((entry) => entry.assetId)).toEqual(['42']);
  });
});

describe('AssetTreeService (permanent tree filter)', () => {
  let settings: ReturnType<typeof signal<NavigatorSettings>>;
  let fleet: AssetHierarchy;
  let service: AssetTreeService;

  const asset = (id: string, type: string, children: string[], extra = {}): RawManagedObject => ({
    id,
    name: id,
    type,
    c8y_IsAsset: {},
    childAssets: { references: children.map((child) => ({ managedObject: { id: child } })) },
    ...extra,
  });
  const device = (id: string): RawManagedObject => ({
    id,
    name: id,
    type: 'ctrl',
    c8y_IsDevice: {},
  });

  /**
   * north (region)
   * ├─ farmW  area West  ── t1 ── d1
   * └─ farmN  area North ── t2 ── d2, d3
   */
  const build = () =>
    buildHierarchy(
      [
        asset('north', 'region', ['farmW', 'farmN']),
        asset('farmW', 'farm', ['t1'], { area: 'West' }),
        asset('farmN', 'farm', ['t2'], { area: 'North' }),
        asset('t1', 'turbine', ['d1']),
        asset('t2', 'turbine', ['d2', 'd3']),
        device('d1'),
        device('d2'),
        device('d3'),
      ],
      '2026-10-30T00:00:00Z'
    );

  const westOnly = (extra: Partial<TreeFilterConfig> = {}): NavigatorSettings => ({
    ...DEFAULT_SETTINGS,
    treeFilter: {
      version: 1,
      enabled: true,
      conditions: [
        { type: 'farm', test: { kind: 'property', path: 'area', op: 'equals', value: 'west' } },
      ],
      hideEmpty: true,
      ...extra,
    },
  });

  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[STATE_SYMBOL];
    fleet = build();
    settings = signal<NavigatorSettings>(westOnly());
    TestBed.configureTestingModule({
      providers: [
        {
          provide: UserPreferencesService,
          useValue: { get: () => of(undefined), set: jasmine.createSpy('set') },
        },
        {
          provide: AssetStoreService,
          useValue: { hierarchy: signal(fleet), searchIndex: signal(null) },
        },
        { provide: NavigatorSettingsService, useValue: { settings } },
      ],
    });
    service = TestBed.inject(AssetTreeService);
  });

  afterEach(() => delete (globalThis as Record<symbol, unknown>)[STATE_SYMBOL]);

  it('shows the filtered hierarchy and counts the assets it hides', () => {
    expect([...service.hierarchy()!.byId.keys()].sort()).toEqual(['farmW', 'north', 't1']);
    expect(service.hierarchy()!.byId.get('north')!.childIds).toEqual(['farmW']);
    expect(service.hiddenByFilter()).toBe(2);
  });

  it('rolls the counts up over what the filtered tree holds — what the footer and badges read', () => {
    const root = service.hierarchy()!.rollup.get('north')!;

    expect(unitCount(fleet.rollup.get('north')!, 'devices')).toBe(3);
    expect(unitCount(root, 'devices')).toBe(1);
    expect(unitCount(root, 'assets')).toBe(3);
  });

  it("searches only the filtered tree; the store's hierarchy keeps every asset", () => {
    service.setFilter({ searchText: 't1' });
    expect(service.filtered()!.matched.has('t1')).toBeTrue();

    service.setFilter({ searchText: 't2' });
    expect(service.filtered()!.matched.has('t2')).toBeFalse();
    expect(TestBed.inject(AssetStoreService).hierarchy()!.byId.has('t2')).toBeTrue();
  });

  it('shows the whole tree, hiding nothing, while the filter is off or has no conditions', () => {
    settings.set(westOnly({ enabled: false }));
    expect(service.hierarchy()).toBe(fleet);
    expect(service.hiddenByFilter()).toBe(0);

    settings.set(westOnly({ conditions: [] }));
    expect(service.hierarchy()).toBe(fleet);
    expect(service.hiddenByFilter()).toBe(0);

    settings.set(westOnly());
    expect(service.hiddenByFilter()).toBe(2);
  });
});
