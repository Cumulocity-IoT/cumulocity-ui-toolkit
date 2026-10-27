import {
  DestroyRef,
  Injectable,
  inject,
  provideEnvironmentInitializer,
  signal,
} from '@angular/core';
import { OptionsService } from '@c8y/ngx-components';
import { NavigatorSettingsService } from '../settings/navigator-settings.service';
import { globalSearchAvailable, openGlobalSearch } from './global-search-channel';
import { type Chord, matchesChord, parseChord } from '../shortcuts/chord';

/** The chord's parsed form; kept under its old name for existing readers. */
export type SearchChord = Chord;

const DEFAULT_CHORD = 'mod+k';

/**
 * The global `⌘K` shortcut for the search palette.
 *
 * `⌘K` used to open the asset-navigator's overlay; that overlay is retired
 * (`docs/GlobalSearch/spec.md`, migration note) and the chord now belongs to the global
 * search. The mechanics carry over unchanged from the overlay's service: one
 * capture-phase listener on the root service, so the chord is seen before a focused
 * input can swallow it, and a chord configurable through the tenant option
 * `assetNavigatorShortcut` (kept under its historical name so a tenant that moved the
 * chord off `⌘K` — it collides with browser search in some setups — keeps its setting).
 *
 * Opening goes through the cross-bundle channel (`global-search-channel.ts`), not an
 * injected service: the palette's sink lives in the `global-search` plugin's bundle.
 * Known hole, inherited from the trigger button itself: the sink is mounted by the
 * action bar, which does not render on every route (`#/home` has no action outlet), so
 * there the chord is a no-op — exactly as the button is absent.
 */
@Injectable({ providedIn: 'root' })
export class SearchShortcutService {
  private readonly options = inject(OptionsService);
  private readonly navigatorSettings = inject(NavigatorSettingsService);

  /** The bound chord, already parsed and labelled for display (the trigger's tooltip). */
  readonly chord = signal<SearchChord>(parseChord(DEFAULT_CHORD)!);

  constructor() {
    const configured = this.options.get('assetNavigatorShortcut') as string | undefined;

    const parsed = typeof configured === 'string' ? parseChord(configured) : undefined;

    if (parsed) this.chord.set(parsed);

    if (typeof window !== 'undefined') {
      const listener = (event: KeyboardEvent) => this.onKeydown(event);

      window.addEventListener('keydown', listener, { capture: true });
      inject(DestroyRef).onDestroy(() =>
        window.removeEventListener('keydown', listener, { capture: true })
      );
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    if (!matchesChord(this.chord(), event)) return;
    // The options menu is recording a chord: the keys are the user's input, not a command.
    if (this.navigatorSettings.recordingShortcut()) return;
    // The user bound the explorer drawer to these very keys — an explicit choice wins over
    // this default, whichever of the two listeners the browser happens to call first.
    const drawerChord = parseChord(this.navigatorSettings.settings().shortcut);

    if (drawerChord && matchesChord(drawerChord, event)) return;
    // Nothing on this page can open the search (no action bar, e.g. `#/home`): leave the
    // keys to the browser rather than swallowing them for nothing.
    if (!globalSearchAvailable()) return;
    // Only claim the chord we were actually configured with — anything else stays with
    // the browser, so we never break a shortcut a user relies on.
    event.preventDefault();
    event.stopPropagation();
    openGlobalSearch();
  }
}

/**
 * Instantiates the listener with the plugin, not with the first component that happens to
 * inject the service — the chord must work before the trigger button has ever rendered.
 */
export function provideSearchShortcut() {
  return provideEnvironmentInitializer(() => void inject(SearchShortcutService));
}
