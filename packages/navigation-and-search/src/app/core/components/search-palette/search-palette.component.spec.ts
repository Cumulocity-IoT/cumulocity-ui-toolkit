import { signal } from '@angular/core';
import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { NavigatorService } from '@c8y/ngx-components';
import { of } from 'rxjs';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import { FuzzyService } from '../../services/search/fuzzy.service';
import { PlatformSearchBackend } from '../../services/search/platform-search.backend';
import { RecentEntriesService } from '../../services/search/recent-entries.service';
import { SearchCorpusService } from '../../services/search/search-corpus.service';
import { SearchShortcutService } from '../../services/search/search-shortcut.service';
import { SEARCH_DEBOUNCE_MS } from '../../services/search/search.model';
import { SearchPaletteComponent } from './search-palette.component';

/** The palette's protected state, read by the spec. */
interface PaletteInternals {
  term(): string;
  loading(): boolean;
  onTermInput(value: string): void;
  open(entry: { route: string[] }): void;
}

describe('SearchPaletteComponent', () => {
  let search: jasmine.Spy;
  let navigate: jasmine.Spy;
  let remember: jasmine.Spy;

  beforeEach(() => {
    navigate = jasmine.createSpy('navigate').and.resolveTo(true);
    remember = jasmine.createSpy('remember').and.resolveTo();
    search = jasmine
      .createSpy('search')
      .and.resolveTo({ results: [], status: 'ok', truncated: false });

    TestBed.configureTestingModule({
      imports: [SearchPaletteComponent],
      providers: [
        { provide: SearchShortcutService, useValue: { chord: signal('') } },
        { provide: FuzzyService, useValue: { rank: (): unknown[] => [] } },
        {
          provide: PlatformSearchBackend,
          useValue: {
            search,
            prewarm: () => Promise.resolve(),
            loadTypeFacets: () => Promise.resolve([]),
          },
        },
        { provide: Router, useValue: { navigate } },
        { provide: NavigatorService, useValue: { items$: of([]) } },
        {
          provide: RecentEntriesService,
          useValue: { load: () => Promise.resolve(), remember },
        },
        { provide: AssetStoreService, useValue: {} },
        { provide: SearchCorpusService, useValue: { corpus: signal(null) } },
      ],
    }).overrideComponent(SearchPaletteComponent, { set: { imports: [], template: '' } });
  });

  function create(initialTerm?: string) {
    const fixture = TestBed.createComponent(SearchPaletteComponent);

    if (initialTerm !== undefined) {
      fixture.componentRef.setInput('initialTerm', initialTerm);
    }
    fixture.detectChanges();

    return fixture.componentInstance as unknown as PaletteInternals;
  }

  it('searches for a term handed over by the tree ("search the whole tenant")', fakeAsync(() => {
    const palette = create('pump');

    tick(SEARCH_DEBOUNCE_MS);
    flushMicrotasks();

    expect(palette.term()).toBe('pump');
    expect(search).toHaveBeenCalledTimes(1);
  }));

  it('does not leave the spinner on when the same query is emitted again', fakeAsync(() => {
    const palette = create();

    palette.onTermInput('pump');
    tick(SEARCH_DEBOUNCE_MS);
    flushMicrotasks();
    expect(palette.loading()).toBeFalse();

    // a trailing space yields the identical query
    palette.onTermInput('pump ');
    tick(SEARCH_DEBOUNCE_MS);
    flushMicrotasks();

    expect(palette.loading()).toBeFalse();
  }));

  it('navigates to a result without waiting for — or depending on — recording the visit', () => {
    remember.and.rejectWith(new Error('preferences unavailable'));
    const palette = create();

    palette.open({ route: ['/device', '42'] });

    expect(navigate).toHaveBeenCalledWith(['/device', '42']);
  });
});
