import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { OptionsService } from '@c8y/ngx-components';
import { NavigatorSettingsService } from '../settings/navigator-settings.service';
import { MODIFIER_LABEL } from '../shortcuts/chord';
import { connectGlobalSearchSink, disconnectGlobalSearchSink } from './global-search-channel';
import { SearchShortcutService } from './search-shortcut.service';

/** `mod+k` as the platform's keyboard sends it. */
function pressModK(): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'k',
    metaKey: MODIFIER_LABEL === '⌘',
    ctrlKey: MODIFIER_LABEL !== '⌘',
    cancelable: true,
  });

  window.dispatchEvent(event);

  return event;
}

describe('SearchShortcutService', () => {
  const drawerShortcut = signal('');
  const recordingShortcut = signal(false);
  let sink: jasmine.Spy;

  beforeEach(() => {
    drawerShortcut.set('');
    recordingShortcut.set(false);
    sink = jasmine.createSpy('sink');
    TestBed.configureTestingModule({
      providers: [
        { provide: OptionsService, useValue: { get: (): undefined => undefined } },
        {
          provide: NavigatorSettingsService,
          useValue: {
            recordingShortcut,
            settings: () => ({ shortcut: drawerShortcut() }),
          },
        },
      ],
    });
    TestBed.inject(SearchShortcutService);
  });

  afterEach(() => disconnectGlobalSearchSink(sink));

  it('opens the search on ⌘K / Ctrl+K', () => {
    connectGlobalSearchSink(sink);

    const event = pressModK();

    expect(sink).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBeTrue();
  });

  it('leaves the keys to the drawer when the user bound the drawer to the same chord', () => {
    connectGlobalSearchSink(sink);
    drawerShortcut.set('mod+k');

    pressModK();

    expect(sink).not.toHaveBeenCalled();
  });

  it('does nothing while the settings drawer records a shortcut', () => {
    connectGlobalSearchSink(sink);
    recordingShortcut.set(true);

    pressModK();

    expect(sink).not.toHaveBeenCalled();
  });

  it('does not swallow the browser shortcut on pages without a search', () => {
    const event = pressModK();

    expect(event.defaultPrevented).toBeFalse();
  });
});
