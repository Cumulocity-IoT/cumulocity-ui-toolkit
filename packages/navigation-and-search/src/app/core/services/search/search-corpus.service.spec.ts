import { type WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FetchClient } from '@c8y/client';
import { buildHierarchy } from '../asset-store/asset-rollup';
import type { AssetHierarchy } from '../asset-store/asset-store.model';
import { AssetStoreService } from '../asset-store/asset-store.service';
import { SearchCorpusService } from './search-corpus.service';

const CORE_SYMBOL = Symbol.for('c8y-ps.search-corpus.v2');

const fleet = (name: string): AssetHierarchy =>
  buildHierarchy([{ id: '1', name, c8y_IsAsset: {} }], '2026-01-01T00:00:00.000Z');

const json = (body: unknown) => ({ ok: true, json: () => Promise.resolve(body) });

describe('SearchCorpusService', () => {
  let service: SearchCorpusService;
  let hierarchy: WritableSignal<AssetHierarchy | null>;
  let refresh: jasmine.Spy;
  let probeOk: boolean;

  beforeEach(() => {
    delete (globalThis as Record<symbol, unknown>)[CORE_SYMBOL];
    hierarchy = signal<AssetHierarchy | null>(fleet('Pump'));
    refresh = jasmine.createSpy('refresh').and.resolveTo();
    probeOk = true;

    const fetch = (url: string) => {
      if (url.includes('withTotalElements=true')) {
        return Promise.resolve(
          probeOk ? json({ statistics: { totalElements: 1 } }) : { ok: false }
        );
      }

      return Promise.resolve(json({ managedObjects: [] }));
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: AssetStoreService, useValue: { hierarchy, refresh } },
        { provide: FetchClient, useValue: { fetch } },
      ],
    });
    service = TestBed.inject(SearchCorpusService);
  });

  afterEach(() => delete (globalThis as Record<symbol, unknown>)[CORE_SYMBOL]);

  it('follows the asset store: a new poll changes names (and status, alarms) in the corpus', async () => {
    await service.load();
    expect(service.corpus()?.map((r) => r.name)).toEqual(['Pump']);

    hierarchy.set(fleet('Pump (renamed)'));

    expect(service.corpus()?.map((r) => r.name)).toEqual(['Pump (renamed)']);
  });

  it('does not stay in passthrough mode after one failed size probe', async () => {
    probeOk = false;
    expect(await service.load()).toBeUndefined();

    probeOk = true;
    const corpus = await service.load();

    expect(corpus?.map((r) => r.id)).toEqual(['1']);
    expect(service.mode()).toBe('prefetched');
  });

  it('does not hold a corpus without assets when the first sweep failed', async () => {
    hierarchy.set(null);
    expect(await service.load()).toBeUndefined();

    hierarchy.set(fleet('Pump'));
    const corpus = await service.load();

    expect(corpus?.map((r) => r.id)).toEqual(['1']);
  });
});
