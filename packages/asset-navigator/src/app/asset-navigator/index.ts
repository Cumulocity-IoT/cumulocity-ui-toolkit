import { hookAction, hookNavigator } from '@c8y/ngx-components';
import { provideAssetStorePrefetch } from '../core/services/asset-store/asset-store.service';
import { ExplorerDrawerHostFactory } from './explorer-drawer-host.factory';
import { TreeNavigatorNodeFactory } from './tree-navigator.node';

/**
 * Public surface of this package — Fast Navigation's two containers
 * (`docs/FastNavigation/tree-component-design.md` §4, §5) over the one shared
 * `AssetTreeComponent` in `shared`.
 *
 * Every view reports into the UI → AI context store from its own component
 * (`ps.asset-navigator.tree` / `.detail`), so nothing needs wiring here.
 */

/**
 * Plugin 1 — the **navigator entry**: our asset tree in the left menu, in the platform
 * entry's place, plus the drawer it opens.
 */
export const assetTreeNavigatorViewProviders = [
  /**
   * Sweep the fleet and start the background poll the moment this plugin loads, so the first
   * drawer open renders from cache instead of showing a spinner. The cadence then rises from
   * 5 min to 30 s for as long as a tree is actually on screen — see `AssetStoreService`.
   */
  provideAssetStorePrefetch(),

  /**
   * *Tree* — our asset tree, next to the platform's *Groups* entry. Groups is not hidden
   * from code: whether it shows is the tenant's call, via the platform's UI setup dialog.
   *
   * `hookNavigator` only — **no `hookRoute`**. The node has no `path` and overrides
   *
   * `hookNavigator` only — **no `hookRoute`**. The node has no `path` and overrides
   * `click()`, so the shell renders the entry natively but performs no navigation: clicking
   * it slides the explorer drawer out over the page the user is on (§5.1). See
   * `TreeNavigatorNode` for why this works and why `NavigatorNodeData.component` does not.
   */
  hookNavigator(TreeNavigatorNodeFactory),

  /**
   * The drawer that entry opens, and the navigator-rail stylesheet — mounted in the header
   * because a shell-rendered menu entry gives us no element of our own to host them from.
   * Contributes no visible action; see `ExplorerDrawerHostComponent`.
   */
  hookAction(ExplorerDrawerHostFactory),
];

export { AssetNavigationService } from './asset-navigation.service';
export { ExplorerDrawerComponent } from './explorer-drawer.component';
export { ExplorerDrawerHostComponent } from './explorer-drawer-host.component';
export { ExplorerDrawerHostFactory } from './explorer-drawer-host.factory';
export { ExplorerDrawerService } from './explorer-drawer.service';
export { TreeNavigatorNode, TreeNavigatorNodeFactory } from './tree-navigator.node';
export { NavigatorRailStylesComponent } from './navigator-rail-styles.component';
