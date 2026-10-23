import { hookAction } from '@c8y/ngx-components';
import { SearchActionFactory } from '../core/components/search-palette/search-action.factory';
import { provideSearchShortcut } from '../core/services/search/search-shortcut.service';

/**
 * Public surface of the Global search plugin — the array named in `cumulocity.config.ts`
 * (`exports[].module`).
 *
 * It contributes **one** thing: the header search button, through the action hook. Everything
 * else — the palette, the ranker, the candidate source — lives in `shared` under
 * `~components/search-palette` and `~services/search`, so this plugin is only the wiring.
 *
 * Note what is deliberately *not* here: a `{ provide: … }` override of any shell service. A
 * plugin's providers land in a child `pluginsInjector-*` environment injector that shell
 * components never resolve from, so such a provider is silently dropped — see AGENTS.md → "A
 * plugin cannot override a shell service with a provider". `hook*` works precisely because the
 * root service *pulls* `HOOK_*` tokens out of every plugin injector. The palette's own
 * services are `providedIn: 'root'`, so they resolve from root in every bundle and need no
 * registration at all.
 *
 * Scope, deliberately: this searches the **whole tenant**, assets and devices. The `⌘K` chord
 * belongs to it too: the asset-navigator's `⌘K` overlay is retired (its hierarchy navigation
 * lives on in the explorer drawer), so the chord now opens this palette — see the migration
 * note in `docs/GlobalSearch/spec.md`.
 *
 * No AI-context reporting for now (asked and answered per AGENTS.md rule 4). If that changes,
 * the palette is the place: report the term, the active chips and the top hits as text.
 */
export const globalSearchViewProviders = [
  hookAction(SearchActionFactory),
  /**
   * The `⌘K` listener — an environment initializer, so the chord works from plugin load,
   * not from the first render of the trigger button.
   */
  provideSearchShortcut(),
];
