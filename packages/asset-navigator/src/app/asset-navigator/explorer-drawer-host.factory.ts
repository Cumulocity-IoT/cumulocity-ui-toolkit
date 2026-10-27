import { Injectable, Injector, inject } from '@angular/core';
import type { Action, ActionFactory } from '@c8y/ngx-components';
import { ExplorerDrawerHostComponent } from './explorer-drawer-host.component';

/**
 * Mounts {@link ExplorerDrawerHostComponent} in the header bar — the only always-mounted
 * place a plugin can put a component — so the *Tree* navigator entry has somewhere to open
 * its drawer. It contributes no visible action; see the component.
 *
 * `component` is used for the same reason the top-bar button uses it: `ActionWithComponent`
 * is the variant the shell renders directly in the header bar, while the label and template
 * variants are folded into the "+" dropdown, where an invisible host would be mounted only
 * while that dropdown is open.
 *
 * Priority is deliberately low — it renders nothing, so it should sort behind every real
 * action rather than reserve a place among them.
 */
@Injectable()
export class ExplorerDrawerHostFactory implements ActionFactory {
  private readonly injector = inject(Injector);

  get(): Action[] {
    return [
      {
        component: ExplorerDrawerHostComponent,
        priority: -100,
        injector: this.injector,
      },
    ];
  }
}
