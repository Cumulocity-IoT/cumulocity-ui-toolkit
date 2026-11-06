import { TestBed } from '@angular/core/testing';
import { IdentityService, InventoryService } from '@c8y/client';
import { AssetDefinitionService } from './asset-definition.service';
import { AssetStoreService } from './asset-store.service';
import { NavigatorSettingsService } from '../settings/navigator-settings.service';
import { DEFAULT_SETTINGS, type NavigatorSettings } from '../settings/navigator-settings.model';
import { defaultRollups } from '../settings/rollup.model';

const CORE_SYMBOL = Symbol.for('c8y-ps.asset-store.v2');
const PAGE_SIZE = 2000;

interface Page {
  data: { id: string; name: string }[];
  paging: { totalElements: number };
}

const page = (ids: string[], totalElements = ids.length): Page => ({
  data: ids.map((id) => ({ id, name: id })),
  paging: { totalElements },
});

const fullPage = (prefix: string): string[] =>
  Array.from({ length: PAGE_SIZE }, (_, i) => `${prefix}-${i}`);

const withMeasurementRollup = (): NavigatorSettings => {
  const rollups = defaultRollups();

  rollups.types['site'] = {
    fields: [{ label: '', metric: { kind: 'measurement', series: 'CPU.Usage', fn: 'avg' } }],
    badge: null,
  };

  return { ...DEFAULT_SETTINGS, rollups };
};

describe('AssetStoreService (high-volume branches)', () => {
  let service: AssetStoreService;
  let childAssetsList: jasmine.Spy;
  let settings: NavigatorSettings;
  // the shared core is module-private; the spec drives it directly
  let core: any;

  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[CORE_SYMBOL];
    childAssetsList = jasmine.createSpy('childAssetsList');
    settings = DEFAULT_SETTINGS;

    TestBed.configureTestingModule({
      providers: [
        { provide: InventoryService, useValue: { childAssetsList } },
        { provide: IdentityService, useValue: {} },
        { provide: AssetDefinitionService, useValue: {} },
        { provide: NavigatorSettingsService, useValue: { settings: () => settings } },
      ],
    });
    service = TestBed.inject(AssetStoreService);
    core = (service as unknown as { core: unknown }).core;
    core.mode.set('high-volume');
  });

  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[CORE_SYMBOL];
  });

  it('applies concurrent loads of different branches, whatever order they answer in', async () => {
    const answer = new Map<string, (value: Page) => void>();

    childAssetsList.and.callFake(
      (parentId: string) => new Promise<Page>((resolve) => answer.set(parentId, resolve))
    );

    // e.g. the startup prefetch, or two branches expanded in quick succession
    const loadA = service.loadChildren('A');
    const loadB = service.loadChildren('B');

    answer.get('B')!(page(['b1']));
    answer.get('A')!(page(['a1']));
    await Promise.all([loadA, loadB]);

    expect(service.branchStatus().get('A')).toBe('loaded');
    expect(service.branchStatus().get('B')).toBe('loaded');
    expect(core.branches.get('A').assets.map((a: { id: string }) => a.id)).toEqual(['a1']);
    expect(core.branches.get('B').assets.map((a: { id: string }) => a.id)).toEqual(['b1']);
  });

  it('discards a branch response that arrives after the scope was reset', async () => {
    let answer!: (value: Page) => void;

    childAssetsList.and.callFake(() => new Promise<Page>((resolve) => (answer = resolve)));

    const load = service.loadChildren('A');

    (service as unknown as { resetHighVolumeState(): void }).resetHighVolumeState();
    answer(page(['a1']));
    await load;

    expect(core.branches.has('A')).toBeFalse();
  });

  it('reloads a stale branch as deep as "load more" had taken it', async () => {
    core.branches.set('A', {
      assets: [],
      total: 5 * PAGE_SIZE,
      loadedAt: '2000-01-01T00:00:00.000Z',
      pagesLoaded: 4,
    });
    childAssetsList.and.callFake((_parentId: string, filter: { currentPage: number }) =>
      Promise.resolve(page(fullPage(`p${filter.currentPage}`), 5 * PAGE_SIZE))
    );

    await service.loadChildren('A');

    expect(childAssetsList.calls.count()).toBe(4);
    expect(core.branches.get('A').pagesLoaded).toBe(4);
  });

  it('asks a branch loaded on expand for latest values only with a measurement rollup', async () => {
    childAssetsList.and.resolveTo(page(['a1']));

    await service.loadChildren('A');
    expect(childAssetsList.calls.mostRecent().args[1].withLatestValues).toBeUndefined();

    settings = withMeasurementRollup();
    await service.loadChildren('B');
    expect(childAssetsList.calls.mostRecent().args[1]).toEqual(
      jasmine.objectContaining({ currentPage: 1, withLatestValues: true })
    );
  });
});

describe('AssetStoreService (latest measurement values)', () => {
  let service: AssetStoreService;
  let list: jasmine.Spy;
  let settings: NavigatorSettings;
  // the request builders are private; the spec drives them directly
  let store: any;
  let core: any;

  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[CORE_SYMBOL];
    settings = DEFAULT_SETTINGS;
    list = jasmine.createSpy('list').and.resolveTo({ data: [{ id: 'R' }], paging: {} });

    TestBed.configureTestingModule({
      providers: [
        { provide: InventoryService, useValue: { list } },
        { provide: IdentityService, useValue: {} },
        { provide: AssetDefinitionService, useValue: {} },
        { provide: NavigatorSettingsService, useValue: { settings: () => settings } },
      ],
    });
    service = TestBed.inject(AssetStoreService);
    store = service;
    core = store.core;
  });

  afterEach(() => {
    delete (globalThis as Record<symbol, unknown>)[CORE_SYMBOL];
  });

  it('sweeps without latest values while no rollup reads a measurement', async () => {
    await store.fetchPage('$filter=(has(c8y_IsAsset))', 1);

    expect(list).toHaveBeenCalledTimes(1);
    expect(list.calls.mostRecent().args[0]).not.toEqual(
      jasmine.objectContaining({ withLatestValues: jasmine.anything() })
    );
  });

  it('asks the same sweep request for latest values once a measurement rollup is configured', async () => {
    settings = withMeasurementRollup();
    await store.fetchPage('$filter=(has(c8y_IsAsset))', 2);

    // one request per page, as before — no request per device
    expect(list).toHaveBeenCalledTimes(1);
    expect(list.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ currentPage: 2, withChildren: true, withLatestValues: true })
    );
  });

  it('asks the root requests of high-volume mode for latest values only with a measurement rollup', async () => {
    core.rootId = 'R';
    await store.fetchRoots();
    expect(list.calls.mostRecent().args[0]).not.toEqual(
      jasmine.objectContaining({ withLatestValues: jasmine.anything() })
    );

    settings = withMeasurementRollup();
    await store.fetchRoots();
    expect(list.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ query: "$filter=(id eq 'R')", withLatestValues: true })
    );

    // no configured root: the tenant's parentless assets
    core.rootId = null;
    list.and.resolveTo({ data: [], paging: {} });
    spyOn(store, 'discoverRoot').and.resolveTo(undefined);
    await store.fetchRoots();
    expect(list.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ onlyRoots: true, withLatestValues: true })
    );
  });

  it('does not add latest values to the mode probe — it reads only the asset count', async () => {
    settings = withMeasurementRollup();
    list.and.resolveTo({ data: [], paging: { totalPages: 3 } });
    await store.probeMode('$filter=(has(c8y_IsAsset))');

    expect(list.calls.mostRecent().args[0]).toEqual(
      jasmine.objectContaining({ pageSize: 1, withChildren: false })
    );
    expect(list.calls.mostRecent().args[0].withLatestValues).toBeUndefined();
  });
});
