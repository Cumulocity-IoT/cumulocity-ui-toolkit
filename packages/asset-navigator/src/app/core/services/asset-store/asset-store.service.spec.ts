import { TestBed } from '@angular/core/testing';
import { IdentityService, InventoryService } from '@c8y/client';
import { AssetDefinitionService } from './asset-definition.service';
import { AssetStoreService } from './asset-store.service';
import { NavigatorSettingsService } from '../settings/navigator-settings.service';

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

describe('AssetStoreService (high-volume branches)', () => {
  let service: AssetStoreService;
  let childAssetsList: jasmine.Spy;
  // the shared core is module-private; the spec drives it directly
  let core: any;

  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[CORE_SYMBOL];
    childAssetsList = jasmine.createSpy('childAssetsList');

    TestBed.configureTestingModule({
      providers: [
        { provide: InventoryService, useValue: { childAssetsList } },
        { provide: IdentityService, useValue: {} },
        { provide: AssetDefinitionService, useValue: {} },
        { provide: NavigatorSettingsService, useValue: {} },
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
});
