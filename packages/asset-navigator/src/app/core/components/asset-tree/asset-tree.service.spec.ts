import { TestBed } from '@angular/core/testing';
import { UserPreferencesService } from '@c8y/ngx-components';
import { of } from 'rxjs';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import { AssetTreeService } from './asset-tree.service';

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
