import { Injectable, signal } from '@angular/core';

/**
 * Whether the search palette is open, and with which term — kept outside `SearchTriggerComponent`
 * because the shell's action bar recreates header action components on every URL change
 * (query-param-only changes included). With the state on the component, such a recreation
 * closed an open palette.
 */
@Injectable({ providedIn: 'root' })
export class SearchPaletteStateService {
  readonly open = signal(false);
  /** A term handed over by another plugin (the asset tree's "search the whole tenant"). */
  readonly requestedTerm = signal('');
}
