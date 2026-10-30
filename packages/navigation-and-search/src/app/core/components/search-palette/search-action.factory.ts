import { Injectable } from '@angular/core';
import type { Action, ActionFactory } from '@c8y/ngx-components';
import { SearchTriggerComponent } from './search-trigger.component';

/**
 * Contributes the global search button to the page header via the action hook.
 *
 * `get()` re-runs on every application-state change, which is the hook's mechanism for
 * showing an action conditionally. Search is useful on every page, so this returns its action
 * unconditionally rather than inspecting the activated route.
 *
 * Known limit, upstream-measured: the action outlet itself is route-dependent — the header
 * button appears on `#/group` but not on `#/home`. That is the shell's outlet, not this
 * factory, so it cannot be fixed from here; a second entry point (a navigator node) is the
 * option if the button has to be reachable from the landing page.
 */
@Injectable()
export class SearchActionFactory implements ActionFactory {
  /**
   * One stable action object: the shell's action bar re-renders header actions whose identity
   * changes, and it asks the factory again on every URL change — a fresh object each time
   * destroyed the trigger and with it an open palette.
   */
  private readonly actions: Action[] = [
    {
      // A component-based action renders its own control in the header, which is what lets
      // the button own the overlay it opens.
      component: SearchTriggerComponent,
      priority: 1000,
    },
  ];

  get(): Action[] {
    return this.actions;
  }
}
