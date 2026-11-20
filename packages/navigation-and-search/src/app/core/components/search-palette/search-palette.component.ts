import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type ElementRef,
  type OnInit,
  afterNextRender,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import {
  CoreModule,
  HighlightComponent,
  HumanizePipe,
  LoadingComponent,
  NavigatorService,
} from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { Subject, debounceTime, map, switchMap } from 'rxjs';
import { PlatformSearchBackend } from '../../services/search/platform-search.backend';
import { SearchShortcutService } from '../../services/search/search-shortcut.service';
import { FuzzyService } from '../../services/search/fuzzy.service';
import { RecentEntriesService } from '../../services/search/recent-entries.service';
import {
  ALARM_SEVERITIES,
  type AlarmSeverityKey,
} from '../../services/asset-store/asset-store.model';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import type { SearchQuery } from '../../services/search/inventory-query';
import { SearchCorpusService, storeResults } from '../../services/search/search-corpus.service';
import {
  FIELD_LABELS,
  addChip,
  freeTextOf,
  parseFieldExpression,
  rankScopes,
  sameChip,
  suggestChips,
  toSearchQuery,
  type ChipSuggestion,
  type QueryChip,
  type TypeOption,
} from '../../services/search/query-chips';
import {
  PAGE_RESULT_LIMIT,
  SEARCH_DEBOUNCE_MS,
  SEARCH_PLACEHOLDER,
  VISIBLE_RESULT_LIMIT,
  type SearchResult,
  type SearchStatus,
  type TypeFacet,
} from '../../services/search/search.model';
import { StatusDotComponent } from '../status-dot/status-dot.component';
import {
  describeDot,
  scopeAlarms,
  totalAlarms,
  worstSeverity,
  type DotSeverity,
} from '../status-dot/status-dot.model';
import {
  flattenNavigatorNodes,
  toRoute,
  type EntryGroup,
  type PaletteEntry,
} from './palette-entry';

/**
 * The global search surface: a text input with filter chips and one ranked list — filter
 * suggestions for what is typed, then navigator pages, recents and matching assets/devices.
 * While the input is empty, alarm and asset-type rows offer the same chips to browse from.
 *
 * **The keyboard model** (issue #421, `docs/GlobalSearch/spec.md` §10). Filters are rows of the
 * list, not a second overlay, so one pair of arrow keys reaches both. The highlight starts on the
 * first filter when the text plainly names it ("husu" → `In: Husum`), otherwise on the first
 * result — see {@link defaultIndex}. `Enter` on a filter row adds its chip, on anything else
 * opens it; `→` with the caret at the end adds the highlighted filter. `Ctrl+Space` jumps to
 * the filters. `Backspace` in an empty input removes the last chip, which is outlined while it
 * is the one that would go. These keys act only while the input has focus — a focused button
 * keeps its own Enter.
 *
 * Text typed here never reaches the platform as an exact filter — the query language has no
 * `like` and no regex, so it goes to the inventory `text=` parameter to narrow the candidate
 * set and the typo tolerance is applied locally by {@link FuzzyService}. Which candidate set
 * that is depends on the tenant's volume; see `PlatformSearchBackend`. `⌘K` opens this palette;
 * the retired navigator overlay's history is in `docs/GlobalSearch/spec.md` §1.
 */
@Component({
  selector: 'ps-search-palette',
  standalone: true,
  imports: [CoreModule, HighlightComponent, HumanizePipe, LoadingComponent, StatusDotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './search-palette.component.html',
  styleUrl: './search-palette.component.less',
})
export class SearchPaletteComponent implements OnInit {
  /**
   * A term to start from, handed over by another plugin — the asset tree's "search the whole
   * tenant" when its own filter (which only sees loaded branches) came up empty. Applied once, on
   * creation: the palette is re-created per open, so there is no case where this should overwrite
   * what the user has since typed.
   */
  readonly initialTerm = input('');

  readonly dismissed = output<void>();

  protected readonly placeholder = SEARCH_PLACEHOLDER;
  /**
   * The bound chord, shown in the input's placeholder — "Search assets and devices (⌘+K)" —
   * so the shortcut is learnable from the surface it opens. Platform-aware (⌘ on Apple,
   * Ctrl elsewhere) and tracks the `assetNavigatorShortcut` tenant option, both via
   * `SearchShortcutService`.
   */
  protected readonly chordLabel = inject(SearchShortcutService).chord;
  protected readonly term = signal('');
  protected readonly loading = signal(false);
  protected readonly facets = signal<readonly TypeFacet[]>([]);
  protected readonly status = signal<SearchStatus | undefined>(undefined);
  protected readonly truncated = signal(false);
  /**
   * The id of the entry the reader moved the highlight to, or `null` before they have — then it
   * sits on the default ({@link defaultIndex}). An id, not a position: filter rows come and go as
   * results arrive, and a stored index would then point at a different row than the one Enter
   * was meant for.
   */
  private readonly cursor = signal<string | null>(null);
  /**
   * The last chip change, for the live region — the visual change alone says nothing to a screen
   * reader. Kept as data so the template translates it like every other string.
   */
  protected readonly announcement = signal<{ action: string; chip: QueryChip } | null>(null);
  protected readonly errorMessage = signal<string | undefined>(undefined);
  /** The applied filters, in the order they were added — the order Backspace removes them. */
  protected readonly chips = signal<readonly QueryChip[]>([]);
  protected readonly alarmSeverities = computed(
    () =>
      this.chips()
        .filter((chip) => chip.field === 'alarm')
        .map((chip) => chip.value) as AlarmSeverityKey[]
  );

  protected readonly fieldLabels = FIELD_LABELS;
  /** The input's text minus a half-typed `field:` expression — what gets ranked. */
  protected readonly freeText = computed(() => freeTextOf(this.term()));
  /** How long the last search took, shown so a local search visibly costs nothing. */
  protected readonly lastDurationMs = signal<number | undefined>(undefined);

  /** The severities offered as filters, most severe first. */
  protected readonly severityOptions: readonly AlarmSeverityKey[] = ALARM_SEVERITIES;

  /**
   * The elapsed time, ready to render.
   *
   * Formatted here rather than in the template because a local search rounds to zero, and a
   * bare `@if (0)` is falsy — which hid the timing in exactly the case worth showing off.
   */
  protected readonly timingLabel = computed(() => {
    const ms = this.lastDurationMs();

    if (ms === undefined) return undefined;

    return ms < 1 ? '<1 ms' : `${ms} ms`;
  });

  /** What the last platform search returned — the candidates in passthrough mode. */
  private readonly remoteCandidates = signal<readonly SearchResult[]>([]);

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private readonly resultList = viewChild<ElementRef<HTMLDivElement>>('resultList');
  private readonly fuzzy = inject(FuzzyService);
  private readonly backend = inject(PlatformSearchBackend);
  private readonly router = inject(Router);
  private readonly navigator = inject(NavigatorService);
  private readonly recentEntries = inject(RecentEntriesService);
  private readonly assetStore = inject(AssetStoreService);
  private readonly corpus = inject(SearchCorpusService).corpus;
  private readonly queryChanges = new Subject<SearchQuery>();

  /** Every navigator leaf, flattened once and filtered locally as you type. */
  private readonly pages = toSignal(
    this.navigator.items$.pipe(map((nodes) => flattenNavigatorNodes(nodes ?? []))),
    { initialValue: [] }
  );

  private inFlight: AbortController | undefined;

  /**
   * Everything that matches, ranked. Kept separate from what is rendered so the chip counts
   * describe the whole match set rather than the visible page — which matters most when the
   * corpus is prefetched and the candidate set is the entire tenant.
   */
  private readonly ranked = computed(() => this.fuzzy.rank(this.candidates(), this.freeText()));

  /**
   * The rows the query selects before text ranking. With the corpus held this is computed **now**,
   * not after the debounce: otherwise a chip added and `4` `Enter` typed within 250 ms ranks the
   * pre-chip set, and Enter opens a `…04` from another park. Only a passthrough tenant waits for
   * the platform.
   */
  private readonly candidates = computed<readonly SearchResult[]>(() => {
    const query = toSearchQuery(this.chips(), this.freeText());

    if (Object.keys(query).length === 0) return [];
    const corpus = this.corpus();
    return corpus ? SearchCorpusService.filter(corpus, query) : this.remoteCandidates();
  });

  /**
   * The icon each asset type carries in the definition catalog, so a result looks like its
   * type rather than like "device or not a device".
   */
  private readonly typeIcons = computed(() => {
    const icons = new Map<string, string>();

    for (const facet of this.facets()) {
      if (facet.icon) icons.set(facet.type, facet.icon);
    }

    return icons;
  });

  /**
   * Every asset that has something below it — the places a scope chip can point at.
   *
   * Read from the fleet cache rather than the corpus, so scopes work in passthrough mode too,
   * where there is no corpus. In high-volume mode that is the loaded branches only.
   */
  private readonly scopeCandidates = computed(() => {
    const hierarchy = this.assetStore.hierarchy();

    if (!hierarchy) return [];

    return storeResults(hierarchy).filter(
      (result) => (hierarchy.byId.get(result.id)?.childIds.length ?? 0) > 0
    );
  });

  /** Ancestor ids by asset id, so a place chip can replace the place it is nested in. */
  private readonly ancestorsById = computed(
    () => new Map(this.scopeCandidates().map((result) => [result.id, result.ancestorIds ?? []]))
  );

  /** Every type a chip can name: the catalog, plus types only seen in results (devices). */
  private readonly typeOptions = computed<TypeOption[]>(() => {
    const options = new Map<string, TypeOption>();

    for (const facet of this.facets()) {
      options.set(facet.type, {
        type: facet.type,
        label: facet.label,
        ...(facet.icon ? { icon: facet.icon } : {}),
      });
    }

    for (const candidate of this.candidates()) {
      if (candidate.type && !options.has(candidate.type)) {
        options.set(candidate.type, { type: candidate.type, label: candidate.type });
      }
    }

    return [...options.values()];
  });

  /** The filter rows for the current input, best first. */
  protected readonly suggestions = computed<ChipSuggestion[]>(() => {
    const text = this.term();
    const chips = this.chips();
    const within = chips.filter((chip) => chip.field === 'in').map((chip) => chip.value);
    const labels = new Map(this.typeOptions().map((option) => [option.type, option.label]));
    const icons = this.typeIcons();

    // Types the current matches carry — only meaningful once the text has narrowed something.
    const resultTypes = new Map<string, number>();

    if (this.freeText().length > 0) {
      for (const result of this.ranked()) {
        if (result.type) resultTypes.set(result.type, (resultTypes.get(result.type) ?? 0) + 1);
      }
    }

    const scopeTypes = new Map<string, string>();
    const corpus = this.corpus();
    return suggestChips(text, chips, {
      types: this.typeOptions(),
      scopesFor: (term) => {
        const scopes = rankScopes(this.scopeCandidates(), term, within);

        for (const { scope } of scopes) scopeTypes.set(scope.id, scope.type);

        return scopes;
      },
      resultTypes,
      typeLabel: (type) => labels.get(type) ?? type,
    }).flatMap((suggestion) => {
      const withIcon =
        suggestion.chip.field === 'in'
          ? {
              ...suggestion,
              icon: icons.get(scopeTypes.get(suggestion.chip.value) ?? '') ?? 'sitemap',
            }
          : suggestion;

      // A filter that would empty the list is not worth offering. Checked against the held corpus
      // exactly as the list would be once it is added — the chips plus this one, ranked against
      // what stays in the input — and that count is what a type shows. A type the results share
      // was counted off those results already, and passthrough tenants hold no corpus, so those
      // skip the check.
      if (!corpus || suggestion.remainder === text.trim()) return [withIcon];
      const next = addChip(chips, suggestion.chip, (id) => this.ancestorsById().get(id) ?? []);
      const matches = SearchCorpusService.filter(corpus, toSearchQuery(next, ''));
      const count = suggestion.remainder
        ? this.fuzzy.rank(matches, suggestion.remainder).length
        : matches.length;

      if (count === 0) return [];

      return [suggestion.chip.field === 'type' ? { ...withIcon, detail: String(count) } : withIcon];
    });
  });

  /** Navigator pages, ranked against the query the same way results are. */
  private readonly matchingPages = computed(() => {
    const term = this.freeText();
    const pages = this.pages();

    if (term.length === 0) return pages;

    // Reuse the result ranker so a page tolerates the same typos a device does.
    const asResults: SearchResult[] = pages.map((page) => ({
      id: page.path,
      name: page.label,
      type: '',
      isDevice: false,
      isAsset: false,
      breadcrumb: page.breadcrumb,
      keywords: page.breadcrumb.join(' '),
      highlights: [] as Array<readonly [number, number]>,
    }));
    const byPath = new Map(pages.map((page) => [page.path, page]));
    return this.fuzzy
      .rank(asResults, term)
      .map((match) => byPath.get(match.id))
      .filter((page): page is (typeof pages)[number] => page !== undefined);
  });

  /**
   * Everything selectable, in the order it is rendered.
   *
   * Recents only make sense as a starting point, so they disappear once a query narrows
   * things down, while pages stay because "take me to the alarms screen" is a perfectly good
   * thing to type.
   */
  protected readonly groups = computed<EntryGroup[]>(() => {
    const groups: EntryGroup[] = [];
    let index = 0;
    const take = (): number => index++;

    const suggestions = this.suggestions();

    if (suggestions.length > 0) {
      groups.push({
        key: 'filters',
        label: gettext('Add filter'),
        entries: suggestions.map((suggestion) => ({
          kind: 'filter' as const,
          id: `filter-${suggestion.chip.field}-${suggestion.chip.value}`,
          label: suggestion.chip.label,
          breadcrumb: [] as string[],
          icon: suggestion.icon ?? '',
          route: [] as string[],
          suggestion,
          index: take(),
        })),
      });
    }

    if (!this.hasQuery()) {
      const recent = this.recentEntries.recent();

      if (recent.length > 0) {
        groups.push({
          key: 'recent',
          label: gettext('Recent'),
          entries: recent.map((entry) => ({
            kind: 'recent' as const,
            id: `recent-${entry.route.join('-')}`,
            label: entry.label,
            breadcrumb: entry.breadcrumb,
            icon: entry.icon,
            route: entry.route,
            index: take(),
          })),
        });
      }
    }

    // Any chip is a statement about assets, so the navigation entries stop competing with the
    // results for space.
    const filtered = this.chips().length > 0;
    const pages = filtered ? [] : this.matchingPages().slice(0, PAGE_RESULT_LIMIT);

    if (pages.length > 0) {
      groups.push({
        key: 'pages',
        label: gettext('Pages'),
        entries: pages.map((page) => ({
          kind: 'page' as const,
          id: `page-${page.path}`,
          label: page.label,
          breadcrumb: page.breadcrumb,
          icon: page.icon,
          route: toRoute(page.path),
          index: take(),
        })),
      });
    }

    const icons = this.typeIcons();
    const results = this.ranked().slice(0, VISIBLE_RESULT_LIMIT);

    if (results.length > 0) {
      groups.push({
        key: 'results',
        label: gettext('Assets and devices'),
        entries: results.map((result) => ({
          kind: 'result' as const,
          id: `result-${result.id}`,
          label: result.name,
          breadcrumb: result.breadcrumb,
          icon: icons.get(result.type) ?? (result.isDevice ? 'exchange' : 'sitemap'),
          route: result.isDevice ? ['/device', result.id] : ['/group', result.id],
          result,
          index: take(),
        })),
      });
    }

    return groups;
  });

  /**
   * Catalog chips annotated with how many current matches carry each type.
   *
   * Counts come from the ranked matches rather than a separate request, so they always agree
   * with what is on screen. Results include devices, whose types the asset catalog does not
   * define, so those are added too — otherwise the types most visible in the list would be
   * the ones you could not filter by.
   */
  protected readonly visibleFacets = computed<TypeFacet[]>(() => {
    const counts = new Map<string, number>();

    for (const candidate of this.ranked()) {
      if (candidate.type) counts.set(candidate.type, (counts.get(candidate.type) ?? 0) + 1);
    }

    const catalog = new Map(this.facets().map((facet) => [facet.type, facet]));

    for (const type of counts.keys()) {
      if (!catalog.has(type)) catalog.set(type, { type, label: type, selected: false });
    }

    const selected = new Set(this.selectedTypes());
    const annotated = [...catalog.values()].map((facet) => {
      const count = counts.get(facet.type);
      return {
        ...facet,
        selected: selected.has(facet.type),
        ...(count === undefined ? {} : { count }),
      };
    });

    const narrowed = counts.size > 0;
    return annotated
      .filter((facet) => !narrowed || facet.selected || (facet.count ?? 0) > 0)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.label.localeCompare(b.label));
  });

  /** The same entries flat, so the keyboard can cross group boundaries. */
  protected readonly entries = computed(() => this.groups().flatMap((group) => group.entries));

  /**
   * Where the highlight sits until the reader moves it. On the first filter when the text plainly
   * names it (`ChipSuggestion.strong` — "husu" the place Husum, "wind" the type) or a `field:` is
   * being typed: Enter then adds it. Otherwise on the first result, so Enter opens it — a looser
   * filter is offered, not assumed, which is what keeps `Rostock` `→` `wtg04` `Enter` opening the
   * turbine even where turbines have sub-assets and so are places too.
   */
  private readonly defaultIndex = computed(() => {
    const entries = this.entries();
    const first = entries[0]?.suggestion;

    if (first && (first.strong || parseFieldExpression(this.term()))) return 0;
    const result = entries.findIndex((entry) => entry.kind !== 'filter');
    return result === -1 ? 0 : result;
  });

  protected readonly activeIndex = computed(() => {
    const entries = this.entries();
    const cursor = this.cursor();
    const moved = cursor === null ? -1 : entries.findIndex((entry) => entry.id === cursor);
    return moved === -1 ? this.defaultIndex() : moved;
  });

  /** The alarm and type rows are a place to start from; once text is typed, filter rows take over. */
  protected readonly showShortcuts = computed(() => this.term() === '');

  protected readonly hasQuery = computed(
    () => this.freeText().length > 0 || this.chips().length > 0
  );

  protected readonly showEmptyState = computed(
    () => this.hasQuery() && !this.loading() && this.entries().length === 0
  );

  /**
   * True when the tenant is too large to hold locally, so matching is limited to what the
   * platform's own token search returned.
   *
   * Stated rather than hidden: in this mode a prefix or a typo in a proper noun can return
   * nothing at all, and a silently shorter list would read as "that object does not exist".
   */
  protected readonly limitedRecallMessage = gettext(
    'This tenant is too large to search locally, so only what the platform already matched is ranked — a prefix or a typo may find nothing. Type more of the exact name.'
  );

  protected readonly limitedRecall = computed(
    () => this.status()?.mode === 'passthrough' && this.freeText().length > 0
  );

  /**
   * A query is being answered remotely. A prefetched tenant resolves locally in under a
   * millisecond, so this only ever appears when the search actually left the browser.
   */
  protected readonly searchingRemotely = computed(
    () => this.loading() && this.ranked().length === 0
  );

  constructor() {
    this.queryChanges
      .pipe(
        // No `distinctUntilChanged`: `emitQuery` has already turned the spinner on, and a
        // dropped repeat (a trailing space, the same term retyped after Esc cleared the
        // results) would leave it on with nothing to show.
        debounceTime(SEARCH_DEBOUNCE_MS),
        // Switching cancels the previous search so a slow response cannot overwrite the
        // results of a newer query.
        switchMap((query) => this.runSearch(query)),
        takeUntilDestroyed()
      )
      .subscribe();

    // The palette is opened by a click on the trigger, so focus has to be moved
    // deliberately; without this the first keystrokes go nowhere.
    afterNextRender(() => this.focusInput());

    // Closing the palette should stop whatever it was still waiting for.
    inject(DestroyRef).onDestroy(() => this.inFlight?.abort());
  }

  protected onTermInput(value: string): void {
    this.term.set(value);
    this.cursor.set(null);
    this.emitQuery();
  }

  /** The type shortcuts below the input add and remove the same chips the filter rows do. */
  protected toggleFacet(type: string): void {
    const option = this.typeOptions().find((candidate) => candidate.type === type);

    this.toggleChip({
      field: 'type',
      value: type,
      label: option?.label ?? type,
      ...(option?.icon ? { icon: option.icon } : {}),
    });
  }

  protected toggleSeverity(severity: AlarmSeverityKey): void {
    this.toggleChip({ field: 'alarm', value: severity, label: severity });
  }

  protected removeChip(chip: QueryChip): void {
    this.chips.update((chips) => chips.filter((existing) => !sameChip(existing, chip)));
    this.announcement.set({ action: gettext('Filter removed'), chip });
    this.afterChipsChanged();
  }

  /**
   * Turns a suggestion into a chip. The text it read is consumed — it has become the chip — and
   * the rest stays, so "nordex rostock" → `In: Rostock` leaves "nordex" to keep refining. A place
   * nested in an applied place replaces it (see `addChip`).
   */
  protected applySuggestion(suggestion: ChipSuggestion): void {
    const chip = { ...suggestion.chip, ...(suggestion.icon ? { icon: suggestion.icon } : {}) };

    this.chips.update((chips) => addChip(chips, chip, (id) => this.ancestorsById().get(id) ?? []));
    this.term.set(suggestion.remainder);
    this.announcement.set({ action: gettext('Filter added'), chip });
    this.afterChipsChanged();
  }

  /**
   * The row's alarm state as the fleet's own status dot — the same `ps-status-dot` the explorer
   * drawer and the quick-access row render, so one colour language covers every surface.
   *
   * `null` when there is nothing to say, which is the one deliberate difference from the tree:
   * the tree always shows a dot because a row *is* an asset, whereas this list interleaves
   * pages and recents, and a green dot on all of them would be noise. Absence therefore means
   * "no active alarms" here.
   *
   * Availability is not encoded (no ring, no half fill): `SearchResult` carries alarm counts
   * only, and a ring that appeared on the store-derived rows but never on the device-fetched
   * ones would read as data rather than as a gap.
   *
   * **While a severity filter is active the dot describes the match, not the asset's worst.**
   * Filtering by *Minor* and getting a red dot is true — the asset also has a critical alarm —
   * but it contradicts the question that was just asked, and it makes the row look like it
   * matched on critical. So the colour and the count are restricted to the selected severities;
   * `description` stays the asset's full alarm picture, which is where "and 2 critical" belongs.
   */
  protected dotOf(
    entry: PaletteEntry
  ): { severity: DotSeverity; description: string; count: number } | null {
    const alarms = entry.result?.alarms;

    if (!alarms) return null;

    // Restricting the counts *before* asking for the worst is what re-colours the dot: the
    // helper still answers "worst of what it was given", it is just given less.
    const scoped = scopeAlarms(alarms, this.alarmSeverities());
    const severity = worstSeverity(scoped);

    if (!severity) return null;

    return {
      severity,
      // The whole truth, always — the dot is scoped, the tooltip is not.
      description: describeDot({ alarms }),
      count: totalAlarms(scoped),
    };
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Keys typed into an input method's composition window are not ours.
    if (event.isComposing) return;

    // Escape works from anywhere in the palette: first the query, then the palette.
    if (event.key === 'Escape') {
      event.preventDefault();
      this.clearOrClose();

      return;
    }

    // Everything else belongs to the input. A focused chip × or shortcut button keeps its own
    // Enter and arrows — handling them here sent Enter on a × to the highlighted result.
    if (event.target !== this.searchInput()?.nativeElement) return;

    // Ctrl+Space on every platform, as in VS Code: Cmd+Space is Spotlight on a Mac. Where the OS
    // claims Ctrl+Space for input-source switching it never arrives; Home and ↑ reach the filters too.
    if (event.key === ' ' && event.ctrlKey) {
      event.preventDefault();
      const first = this.entries()[0];

      if (first?.kind === 'filter') this.setActive(0);

      return;
    }

    const modified = event.shiftKey || event.altKey || event.metaKey || event.ctrlKey;

    if (event.key === 'ArrowRight' && !modified && this.addFilterFromCaret()) {
      event.preventDefault();

      return;
    }

    // Not on key repeat: holding Backspace to clear the text would run on through every chip.
    if (
      event.key === 'Backspace' &&
      !event.repeat &&
      this.term() === '' &&
      this.chips().length > 0
    ) {
      event.preventDefault();
      this.removeChip(this.chips()[this.chips().length - 1]);

      return;
    }

    const total = this.entries().length;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveActive(1, total);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveActive(-1, total);
        break;
      case 'Home':
        if (total > 0) {
          event.preventDefault();
          this.setActive(0);
        }
        break;
      case 'End':
        if (total > 0) {
          event.preventDefault();
          this.setActive(total - 1);
        }
        break;

      case 'Enter': {
        event.preventDefault();
        const active = this.entries()[this.activeIndex()];

        if (active) this.open(active);
        break;
      }
      default:
        break;
    }
  }

  /** Clears the query if there is one, otherwise closes. Shared by Escape and the ×. */
  protected clearOrClose(): void {
    if (this.hasQuery()) {
      this.term.set('');
      this.chips.set([]);
      this.cursor.set(null);
      this.emitQuery();
      this.focusInput();

      return;
    }
    this.dismissed.emit();
  }

  protected setActive(index: number): void {
    this.cursor.set(this.entries()[index]?.id ?? null);
    // The list scrolls, so the selection has to be brought along or arrowing past the fold
    // silently moves an invisible highlight.
    this.resultList()
      ?.nativeElement.querySelector(`[data-entry-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  protected open(entry: PaletteEntry): void {
    if (entry.suggestion) {
      this.applySuggestion(entry.suggestion);

      return;
    }
    void this.router.navigate(entry.route);
    this.dismissed.emit();
    // Recording the visit is a side note: it must neither delay the navigation by a round
    // trip nor, when the preference write fails, prevent it.
    this.recentEntries.remember(entry).catch((): void => undefined);
  }

  ngOnInit(): void {
    // A handed-over term is applied as if typed, so the debounce, the abort handling and the
    // ranking are the one code path — a second "search now" entry point would drift from it.
    // Read here, not in the constructor: inputs are not bound yet while it runs.
    const handedOver = this.initialTerm().trim();

    if (handedOver) this.onTermInput(handedOver);

    void this.recentEntries.load();
    void this.loadFacets();
    // Fire and forget: the corpus is only an optimisation, and a failure here just means
    // the first search loads it instead.
    void this.backend.prewarm();
  }

  private toggleChip(chip: QueryChip): void {
    this.chips.update((chips) =>
      chips.some((existing) => sameChip(existing, chip))
        ? chips.filter((existing) => !sameChip(existing, chip))
        : addChip(chips, chip)
    );
    this.afterChipsChanged();
  }

  private afterChipsChanged(): void {
    this.cursor.set(null);
    this.emitQuery();
    this.focusInput();
  }

  /**
   * `→` with the caret at the end of the text adds the highlighted filter — or, before the reader
   * has moved the highlight, the first one. Anywhere else in the text it is the caret moving, and
   * with a result highlighted it would add a filter the reader is not looking at, so both are
   * left alone.
   */
  private addFilterFromCaret(): boolean {
    const input = this.searchInput()?.nativeElement;

    if (
      !input ||
      input.selectionStart !== input.value.length ||
      input.selectionEnd !== input.value.length
    ) {
      return false;
    }
    const entries = this.entries();
    const chosen =
      entries[this.activeIndex()]?.suggestion ??
      (this.cursor() === null ? entries[0]?.suggestion : undefined);

    if (!chosen) return false;
    this.applySuggestion(chosen);

    return true;
  }

  private moveActive(delta: number, total: number): void {
    if (total === 0) return;
    // Wrapping keeps a long list reachable from either end without a modifier.
    this.setActive((this.activeIndex() + delta + total) % total);
  }

  private focusInput(): void {
    this.searchInput()?.nativeElement.focus();
  }

  private selectedTypes(): string[] {
    return this.chips()
      .filter((chip) => chip.field === 'type')
      .map((chip) => chip.value);
  }

  private emitQuery(): void {
    const query = toSearchQuery(this.chips(), this.freeText());

    if (Object.keys(query).length === 0) {
      this.remoteCandidates.set([]);
      this.loading.set(false);

      return;
    }

    this.loading.set(true);
    this.queryChanges.next(query);
  }

  /**
   * Runs one search, cancelling whatever it supersedes.
   *
   * `switchMap` alone is not enough. It stops the *stream* from emitting a stale response,
   * but the promise it abandoned keeps running, so a slow earlier request could still write
   * its results over a newer one. Aborting stops the request on the wire and lets this skip
   * the write, which fixes the race as well as sparing the platform work nobody will read.
   */
  private async runSearch(query: SearchQuery): Promise<void> {
    this.inFlight?.abort();
    const startedAt = performance.now();
    const controller = new AbortController();

    this.inFlight = controller;

    try {
      const response = await this.backend.search(query, controller.signal);

      if (controller.signal.aborted) return;
      this.remoteCandidates.set(response.results);
      this.status.set(response.status);
      this.truncated.set(response.truncated);
      this.errorMessage.set(undefined);
      this.lastDurationMs.set(Math.round(performance.now() - startedAt));
    } catch {
      // Our own cancellation is not a failure and must not surface as one.
      if (controller.signal.aborted) return;
      this.remoteCandidates.set([]);
      this.errorMessage.set(gettext('Search is unavailable right now. Try again.'));
    } finally {
      // Only the newest request owns the spinner; an aborted one must not clear it.
      if (this.inFlight === controller) this.loading.set(false);
    }
  }

  private async loadFacets(): Promise<void> {
    try {
      this.facets.set(await this.backend.loadTypeFacets());
    } catch {
      // Chips are an enhancement; text search still works without them.
      this.facets.set([]);
    }
  }
}
