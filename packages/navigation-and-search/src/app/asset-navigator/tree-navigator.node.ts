import { Injectable, inject } from '@angular/core';
import { NavigatorNode, type ClickOptions, type NavigatorNodeFactory } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { ExplorerDrawerService } from './explorer-drawer.service';

/**
 * The *Tree* navigator entry: rendered entirely by the shell, but it opens the explorer
 * drawer instead of navigating.
 *
 * Two properties of `NavigatorNode` make that possible, and both are load-bearing:
 *
 * - **No `path`.** `canNavigate` is literally `typeof this.path !== 'undefined'`, so an
 *   *absent* path — not `''`, which is defined and would route to the app root — leaves
 *   `[routerLink]` unset and the shell performs no navigation on click.
 * - **`click()` is an overridable hook.** `NavigatorNodeComponent` calls `node.click(...)`
 *   for every click, navigation or not. This is the platform's own idiom for an acting
 *   node: `AssetNode` overrides `click()`, and `AssetNode` assigns `loadMoreNode.click`.
 *
 * The alternative, `NavigatorNodeData.component`, replaces the **menu entry's own markup**
 * with ours — so the entry has to re-implement the shell's node styling and cannot match
 * its neighbours (type scale, icon weight, padding). We shipped that once; it looked
 * foreign. This keeps the native entry *and* the routeless behaviour.
 */
export class TreeNavigatorNode extends NavigatorNode {
  static override NAME = 'PsTreeNode';

  constructor(private readonly drawer: ExplorerDrawerService) {
    // Deliberately no `path` — see the class comment.
    super({
      label: gettext('Tree'),
      // Unprefixed → the Delight set (`dlt-c8y-icon-sitemap`); a `c8y-` prefix would ask
      // for the platform icon set instead, which has no sitemap glyph. See `IconDirective`.
      icon: 'sitemap',
      // 2000 is where `AssetNodeFactory` hooks the platform's Groups node (its
      // `rootNodePriority` default), so ours lands just above it.
      priority: 2100,
    });
  }

  override click(_options: ClickOptions = {}): void {
    this.drawer.toggle();
  }

  override toString(): string {
    return TreeNavigatorNode.NAME;
  }
}

/**
 * Builds the node with the drawer service injected. A factory rather than a bare node
 * because the node needs to reach the drawer state, and `hookNavigator` accepts a
 * `NavigatorNodeFactory` (`ExtensionFactory<NavigatorNode>`) for exactly this.
 */
@Injectable()
export class TreeNavigatorNodeFactory implements NavigatorNodeFactory {
  private readonly drawer = inject(ExplorerDrawerService);

  get(): NavigatorNode[] {
    return [new TreeNavigatorNode(this.drawer)];
  }
}
