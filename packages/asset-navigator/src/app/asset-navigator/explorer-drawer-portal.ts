import { ApplicationRef, createComponent, type ComponentRef } from '@angular/core';
import { ExplorerDrawerRootComponent } from './explorer-drawer-root.component';

/**
 * One app-lifetime instance, keyed on a global symbol so a second copy of this bundle cannot
 * open a second drawer (the same rule as every other cross-bundle singleton — see `AGENTS.md`).
 */
const PORTAL = Symbol.for('ps.assetNavigator.drawerPortal.v1');

type PortalSlot = { [PORTAL]?: ComponentRef<ExplorerDrawerRootComponent> };

/**
 * Creates the drawer outside the component tree, attached to `document.body`, exactly once.
 *
 * **Why this is not just a template.** The drawer is mounted through `hookAction`, and
 * `ActionBarService.items$` is a `fromTrigger(router, …)` — it re-runs every factory on each
 * `NavigationEnd` and the action bar's `@for` tracks items by object identity, so every action
 * component is **destroyed and recreated on every route change**. Hosting the drawer inside one
 * meant a blank frame plus a replayed 180ms slide-in on each navigation: the flicker. Since a
 * click in the drawer now routes and deliberately leaves it open, that happens on the primary
 * gesture, not in some corner case.
 *
 * **It must be built from the *root* environment injector** — `appRef.injector` — and not from the
 * injector of whichever action component happened to trigger this. Those are torn down with the
 * component on the next navigation, and a portal holding a destroyed injector throws NG0205
 * ("injector has already been destroyed") the next time the drawer resolves a service. Every
 * service the drawer needs is `providedIn: 'root'`, so the root injector reaches all of them.
 *
 * Fixed positioning is what makes the move out of the tree safe — the drawer, its backdrop and the
 * cascade all position against the viewport (see `explorer-drawer.component.less`), so their DOM
 * ancestor is irrelevant. `attachView` is what keeps them in the app's change detection.
 *
 * **Deliberately never destroyed.** Tearing it down with whatever action component happened to
 * create it would reintroduce the very bug. One instance per app is the whole point; it goes when
 * the app does.
 */
export function ensureExplorerDrawerPortal(appRef: ApplicationRef): void {
  const slot = globalThis as PortalSlot;

  if (slot[PORTAL]) return;

  const ref = createComponent(ExplorerDrawerRootComponent, {
    environmentInjector: appRef.injector,
  });

  slot[PORTAL] = ref;
  appRef.attachView(ref.hostView);
  document.body.appendChild(ref.location.nativeElement);
}
