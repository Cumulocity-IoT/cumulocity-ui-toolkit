import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ExplorerDrawerComponent } from './explorer-drawer.component';
import { ExplorerDrawerService } from './explorer-drawer.service';
import { NavigatorRailStylesComponent } from './navigator-rail-styles.component';

/**
 * What the drawer portal renders, once, for the lifetime of the app.
 *
 * Everything here has to **outlive every route**: the drawer itself (a click in it navigates and
 * it stays open, so a route change must not tear it down) and the navigator-rail stylesheet,
 * which Angular injects into `<head>` when the component is created and removes again when the
 * last instance is destroyed — recreating it per route made the rail collapse and reappear.
 *
 * It is not mounted by a template. `ensureExplorerDrawerPortal()` creates it and appends it to
 * `document.body`; see that function for why.
 */
@Component({
  selector: 'ps-explorer-drawer-root',
  template: `
    <!-- Carrier for the unscoped navigator-rail stylesheet. See the component. -->
    <ps-navigator-rail-styles />

    <!-- Opened from the *Tree* navigator entry. -->
    @if (drawer.open()) {
      <ps-explorer-drawer />
    }
  `,
  host: { style: 'display: contents' },
  imports: [ExplorerDrawerComponent, NavigatorRailStylesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerDrawerRootComponent {
  protected readonly drawer = inject(ExplorerDrawerService);
}
