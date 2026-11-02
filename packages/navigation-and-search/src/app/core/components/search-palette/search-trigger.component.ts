import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import {
  connectGlobalSearchSink,
  disconnectGlobalSearchSink,
  type GlobalSearchRequest,
} from '../../services/search/global-search-channel';
import { SearchShortcutService } from '../../services/search/search-shortcut.service';
import { SearchPaletteComponent } from './search-palette.component';
import { SearchPaletteStateService } from './search-palette-state.service';

/**
 * The header button contributed through the action hook, and the overlay it opens.
 *
 * The action hook renders this inside `c8y-action-outlet`, a narrow strip in the page header,
 * so the palette is rendered as a viewport-anchored overlay rather than inside that strip.
 *
 * **Why it is safe to own state here, unlike a drawer.** `ActionBarService.items$` is a
 * `fromTrigger(router, …)`, so every navigation destroys and recreates this component — see
 * AGENTS.md → "A `hookAction` component is mounted on every route, not *kept alive*". That
 * makes it the wrong host for anything that must survive a navigation, but the palette is
 * *transient by design*: it closes on selecting a result, and navigating is exactly when it
 * should be gone. So `open` resets to `false` for free, and nothing needs the
 * `createComponent` + `appRef.attachView` portal the explorer drawer requires.
 *
 * The one thing that does have to survive is what the palette *loaded* — the corpus, the DTM
 * facets and the recents. All three live in `providedIn: 'root'` services behind
 * `globalThis` symbols, so a re-created palette finds them warm rather than refetching.
 */
@Component({
  selector: 'ps-search-trigger',
  standalone: true,
  imports: [CoreModule, SearchPaletteComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <button
      class="main-header-button"
      [title]="tooltip()"
      [attr.aria-label]="tooltip()"
      [attr.aria-expanded]="open()"
      (click)="toggle()"
      type="button"
    >
      <i class="icon-2x" c8yIcon="search" aria-hidden="true"></i>
    </button>

    @if (open()) {
      <div class="ps-search-backdrop" (click)="close()" aria-hidden="true"></div>
      <div class="ps-search-overlay" [attr.aria-label]="label | translate" role="dialog">
        <ps-search-palette [initialTerm]="requestedTerm()" (dismissed)="close()" />
      </div>
    }
  `,
  styles: [
    `
      .ps-search-backdrop {
        position: fixed;
        inset: 0;
        z-index: 1040;
      }

      .ps-search-overlay {
        position: fixed;
        top: 56px;
        left: 50%;
        transform: translateX(-50%);
        width: min(720px, 92vw);
        max-height: 80vh;
        overflow: hidden;
        z-index: 1050;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
        /*
         * The upstream version used var(--c8y-component-background, #fff), which does not
         * resolve — so every tenant got the #fff fallback and the palette was an opaque white
         * card on a dark-mode page. --c8y-body-background-color is the token that actually
         * answers "the card's own background" (AGENTS.md has the verified table).
         */
        background: var(--c8y-body-background-color);
        color: var(--c8y-text-color);
      }
    `,
  ],
})
export class SearchTriggerComponent {
  protected readonly label = gettext('Search');
  private readonly shortcut = inject(SearchShortcutService);
  /** Names the chord, whatever the tenant bound it to — discoverability is the tooltip. */
  protected readonly tooltip = computed(() => `${this.label} (${this.shortcut.chord().label})`);
  private readonly state = inject(SearchPaletteStateService);
  protected readonly open = this.state.open;
  protected readonly requestedTerm = this.state.requestedTerm;

  constructor() {
    // Registered while mounted, cleared on destroy. The action bar recreates this component on
    // every navigation, so the pair has to be symmetric — and `disconnect` only clears *this*
    // sink, so the new instance registering before the old one tears down cannot end up with an
    // empty slot.
    const sink = (request: GlobalSearchRequest) => this.openWith(request);

    connectGlobalSearchSink(sink);
    inject(DestroyRef).onDestroy(() => disconnectGlobalSearchSink(sink));
  }

  protected toggle(): void {
    if (!this.open()) this.requestedTerm.set('');
    this.open.update((isOpen) => !isOpen);
  }

  protected close(): void {
    this.open.set(false);
    this.requestedTerm.set('');
  }

  /** Opens the palette with a term already in the input. */
  private openWith(request: GlobalSearchRequest): void {
    this.requestedTerm.set(request.term?.trim() ?? '');
    this.open.set(true);
  }
}
