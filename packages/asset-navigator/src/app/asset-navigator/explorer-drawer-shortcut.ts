import { inject, provideEnvironmentInitializer } from '@angular/core';
import { NavigatorSettingsService } from '../core/services/settings/navigator-settings.service';
import { matchesChord, parseChord } from '../core/services/shortcuts/chord';
import { ExplorerDrawerService } from './explorer-drawer.service';

/**
 * The configurable chord that opens and closes the explorer drawer (options menu → Keyboard
 * shortcut). An environment initializer, so it works from plugin load, before the drawer has
 * ever been opened; the chord is read from the settings on every keydown, so a change applies
 * at once. No chord is bound by default.
 */
export function provideExplorerDrawerShortcut() {
  return provideEnvironmentInitializer(() => {
    if (typeof window === 'undefined') return;
    const settings = inject(NavigatorSettingsService);
    const drawer = inject(ExplorerDrawerService);

    void settings.load();
    window.addEventListener(
      'keydown',
      (event) => {
        const chord = parseChord(settings.settings().shortcut);

        if (!chord || settings.recordingShortcut() || !matchesChord(chord, event)) return;
        event.preventDefault();
        // other window listeners too (the search shortcut), not only the page below
        event.stopImmediatePropagation();
        drawer.toggle();
      },
      { capture: true }
    );
  });
}
