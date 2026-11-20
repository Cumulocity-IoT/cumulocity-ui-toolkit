import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

/**
 * Turns the platform's *closed* navigator into a 48px icon rail.
 *
 * The shell's left drawer is binary — `nav#navigator.navigator` is either `.open` (240px) or slid
 * entirely off-canvas (`left: -(240px + 10px)`), so collapsing it costs the user every navigation
 * affordance. These rules redefine "closed" as a narrow rail: icons stay visible, labels and the
 * app name collapse away, and the layout partners shift by 48px instead of 0.
 *
 * No state is involved — `HeaderService.toggleNavigator()` keeps flipping the same `.open` class;
 * only what "not open" looks like changes.
 *
 * `ViewEncapsulation.None` makes Angular inject the sheet unscoped into `<head>` when this
 * component is instantiated, which is what works for a remote plugin module (an `angular.json`
 * `styles` entry does not). The flip side is that Angular *removes* the sheet again when the last
 * instance is destroyed, so it must be rendered by something that outlives every route or the rail
 * collapses and reappears on each navigation: in the drawer plugin that is
 * {@link ExplorerDrawerRootComponent} (created once, outside the component tree — see
 * `ensureExplorerDrawerPortal`), and in the overlay plugin {@link AssetNavigatorActionComponent}.
 */
@Component({
  selector: 'ps-navigator-rail-styles',
  template: '',
  styleUrls: ['./navigator-rail-styles.component.less'],
  encapsulation: ViewEncapsulation.None,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NavigatorRailStylesComponent {}
