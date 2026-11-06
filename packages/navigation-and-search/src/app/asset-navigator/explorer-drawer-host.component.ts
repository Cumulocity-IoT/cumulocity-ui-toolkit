import { ApplicationRef, ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ensureExplorerDrawerPortal } from './explorer-drawer-portal';

/**
 * Mount point for the explorer drawer — and nothing else.
 *
 * **Renders no affordance and no content of its own.** It is registered through `hookAction`
 * purely to be constructed: `TreeNavigatorNode` has no `path` and overrides `click()`, so the
 * shell renders that menu entry natively and there is no element of ours in the navigator to hang
 * a drawer off (see `TreeNavigatorNode`, and the same note in `AGENTS.md`).
 *
 * The header bar is the only place a plugin can get mounted on every route — but *mounted on
 * every route* is not the same as *alive across every route*: the shell recreates action
 * components on each navigation. So this component does not host the drawer, it only makes sure
 * the app-lifetime portal exists; `ensureExplorerDrawerPortal()` explains the rest, including why
 * hosting it here directly caused a flicker.
 *
 * `display: contents` rather than a hidden box: an empty `d-block` would still take a slot's
 * worth of gap in the header's flex row, which is a visible dent in the spacing next to the
 * real buttons.
 *
 * It exists because the drawer and the top-bar overlay are **separate plugins** (see
 * `index.ts`). Sharing `AssetNavigatorActionComponent` as the host would have made the menu
 * entry depend on the other plugin being installed *and* on cross-bundle state — each remote
 * compiles its own `ExplorerDrawerService` with its own root instance, so the entry would have
 * toggled a signal nothing was rendering from.
 */
@Component({
  selector: 'ps-explorer-drawer-host',
  template: '',
  host: { style: 'display: contents' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerDrawerHostComponent {
  constructor() {
    // `ApplicationRef`, not this component's own injector: the portal outlives this component, so
    // it has to be built from the root environment injector or it holds a destroyed one (NG0205).
    // See `ensureExplorerDrawerPortal`.
    //
    // In a microtask, not inline: this constructor runs inside the action bar's change-detection
    // pass, and creating a view and attaching it to `ApplicationRef` from there is asking for a
    // changed-after-checked error. The portal is idempotent, so two hosts queueing in the same
    // tick still produce one drawer.
    const appRef = inject(ApplicationRef);

    queueMicrotask(() => ensureExplorerDrawerPortal(appRef));
  }
}
