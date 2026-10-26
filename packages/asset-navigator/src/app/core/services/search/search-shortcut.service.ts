import { Injectable, inject, provideEnvironmentInitializer, signal } from '@angular/core';
import { OptionsService } from '@c8y/ngx-components';
import { openGlobalSearch } from './global-search-channel';

/** How the shortcut is described to the user, per platform. */
const MODIFIER_LABEL = /Mac|iPhone|iPad/.test(
  typeof navigator === 'undefined' ? '' : navigator.platform
)
  ? '⌘'
  : 'Ctrl';

/**
 * A parsed chord: modifier requirements plus the key it fires on.
 * `'mod'` means Meta on Apple platforms, Control elsewhere.
 */
export interface SearchChord {
  key: string;
  mod: boolean;
  shift: boolean;
  alt: boolean;
  label: string;
}

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

  /** The bound chord, already parsed and labelled for display (the trigger's tooltip). */
  readonly chord = signal<SearchChord>(parseChord(DEFAULT_CHORD));

  constructor() {
    const configured = this.options.get('assetNavigatorShortcut') as string | undefined;

    if (typeof configured === 'string' && configured.trim()) {
      this.chord.set(parseChord(configured.trim()));
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', (event) => this.onKeydown(event), { capture: true });
    }
  }

  private onKeydown(event: KeyboardEvent): void {
    const chord = this.chord();
    const modifier = MODIFIER_LABEL === '⌘' ? event.metaKey : event.ctrlKey;

    if (
      event.key.toLowerCase() !== chord.key ||
      modifier !== chord.mod ||
      event.shiftKey !== chord.shift ||
      event.altKey !== chord.alt
    ) {
      return;
    }
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

/** `mod+k`, `ctrl+shift+k`, `alt+g` … Unparseable input falls back to the default. */
function parseChord(raw: string): SearchChord {
  const parts = raw
    .toLowerCase()
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
  const key = parts.pop();

  if (!key) return parseChord(DEFAULT_CHORD);
  const mod = parts.includes('mod') || parts.includes('ctrl') || parts.includes('cmd');
  const shift = parts.includes('shift');
  const alt = parts.includes('alt');
  const label = [
    mod ? MODIFIER_LABEL : null,
    shift ? 'Shift' : null,
    alt ? 'Alt' : null,
    key.toUpperCase(),
  ]
    .filter(Boolean)
    .join('+');
  return { key, mod, shift, alt, label };
}
