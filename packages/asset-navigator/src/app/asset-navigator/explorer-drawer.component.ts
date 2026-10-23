import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  viewChild,
} from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { AssetTreeComponent } from '../core/components/asset-tree/asset-tree.component';
import {
  DRAWER_TREE_CONFIG,
  type AssetActivation,
} from '../core/components/asset-tree/asset-tree.model';
import { AssetTreeService } from '../core/components/asset-tree/asset-tree.service';
import { AssetStoreService } from '../core/services/asset-store/asset-store.service';
import { AssetNavigationService } from './asset-navigation.service';
import {
  DRAWER_MAX_WIDTH,
  DRAWER_MIN_WIDTH,
  ExplorerDrawerService,
} from './explorer-drawer.service';

/**
 * Container B — the explorer drawer (§5).
 *
 * Replaces the side-menu asset-tree entry: same place and gesture users already know,
 * but wide enough that a turbine name and model fit without ellipsis (P1, AC-T2), with
 * a sticky path header so the path you came from cannot scroll away (P5).
 *
 * It hosts the one `AssetTreeComponent` with the drawer's config, and it deliberately
 * does **not** clip horizontally — the cascade grows out of its right edge (§6.4).
 */
@Component({
  selector: 'ps-explorer-drawer',
  templateUrl: './explorer-drawer.component.html',
  styleUrls: ['./explorer-drawer.component.less'],
  imports: [CoreModule, AssetTreeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerDrawerComponent {
  protected readonly drawer = inject(ExplorerDrawerService);
  private readonly tree = inject(AssetTreeService);
  private readonly assets = inject(AssetStoreService);
  private readonly navigation = inject(AssetNavigationService);

  // Not `required`: the tree's `cascadeHost` binding is evaluated in the same change
  // detection pass that creates `#panel`, so the query is still empty at that point.
  // Harmless — the drawer passes an explicit `cascadeFromLeft`, and the host is only the
  // fallback for deriving it.
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');
  private readonly filterInput = viewChild<ElementRef<HTMLInputElement>>('filterInput');

  protected readonly treeConfig = DRAWER_TREE_CONFIG;
  protected readonly minWidth = DRAWER_MIN_WIDTH;
  protected readonly maxWidth = DRAWER_MAX_WIDTH;

  /**
   * Read straight from the shared tree state — the input renders the one term the tree is
   * actually filtered by, so the drawer can never show an empty field over a filtered
   * tree (see `AssetTreeService.searchText`).
   */
  protected readonly searchText = this.tree.searchText;

  /**
   * The selected node's path, sticky above the tree (§5.2, P5). Never truncated below
   * the last two segments — middle segments collapse to `…`, with the full path on the
   * element's title.
   */
  protected readonly pathSegments = computed(() => {
    const selectedId = this.tree.selectedId();

    if (!selectedId) return [];

    return this.assets.pathOf(selectedId).map((node) => node.name);
  });

  protected readonly pathLabel = computed(() => this.pathSegments().join(' › '));

  /** Teardown for an in-progress width drag, or `null` when none is running. */
  private endDrag: (() => void) | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.endDrag?.());

    // Chrome budget above the hierarchy, from the measured navigator header (see
    // `ExplorerDrawerService.chromeHeight`) — written imperatively rather than through a
    // `[style.--…]` binding so the CSS fallback stays in the stylesheet when nothing was
    // measured. The breadcrumb absorbs the remainder; see the stylesheet.
    effect(() => {
      const panel = this.panel()?.nativeElement;
      const chrome = this.drawer.chromeHeight();

      if (!panel) return;
      if (chrome) panel.style.setProperty('--ps-drawer-chrome-height', `${chrome}px`);
      else panel.style.removeProperty('--ps-drawer-chrome-height');
    });
  }

  protected onSearch(value: string): void {
    this.tree.setFilter({ searchText: value });
  }

  /** Trailing button: reset when there is a term, focus when there is not. */
  protected onResetSearch(): void {
    this.tree.setFilter({ searchText: '' });
    this.filterInput()?.nativeElement.focus();
  }

  /** Type-ahead in the tree lands in the filter input (§3.6). */
  protected onFilterTyped(character: string): void {
    this.tree.setFilter({ searchText: this.searchText() + character });
    const input = this.filterInput()?.nativeElement;

    if (input) {
      input.focus();
      // After the signal write has been rendered, so the caret ends up after the
      // character the user just typed rather than before it.
      requestAnimationFrame(() => input.setSelectionRange(input.value.length, input.value.length));
    }
  }

  protected async onActivate(event: AssetActivation): Promise<void> {
    // The drawer stays open, pinned or not: routing is now what a plain click does, so
    // closing here would tear the drawer down on the first step of any traversal. Closing
    // is the user's own act — Esc, the backdrop, or the close button.
    await this.navigation.open(event.node, event.newTab, event.view);
  }

  protected onRequestClose(): void {
    this.drawer.close();
  }

  // ── resize (§5.1) ────────────────────────────────────────────────────────────

  protected onResizeStart(event: PointerEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = this.drawer.width();

    // Closing the cascade on resize start is a rule, not a nicety: an open panel's left
    // edge is pinned to a width that is about to change (§6.4 rule 5).
    this.drawer.beginResize();

    const move = (moveEvent: PointerEvent) => {
      this.drawer.setWidth(startWidth + (moveEvent.clientX - startX));
    };
    // `pointercancel` too, and a teardown registered on the component: a drag interrupted
    // by the browser (or by the drawer closing mid-drag) would otherwise leave a
    // `pointermove` handler on `window` resizing a drawer that is no longer there.
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      this.endDrag = null;
      void this.drawer.endResize();
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    this.endDrag = up;
  }

  protected onResizeKeydown(event: KeyboardEvent): void {
    // The grip is reachable and usable without a pointer (NFR-T3).
    const step = event.shiftKey ? 40 : 10;

    if (event.key === 'ArrowLeft') this.drawer.setWidth(this.drawer.width() - step);
    else if (event.key === 'ArrowRight') this.drawer.setWidth(this.drawer.width() + step);
    else return;
    event.preventDefault();
    void this.drawer.endResize();
  }

  protected async onTogglePin(): Promise<void> {
    await this.drawer.togglePinned();
  }

  /** Outside click closes the drawer only while it is overlaying content (§5.1). */
  protected onBackdropClick(): void {
    if (!this.drawer.pinned()) this.drawer.close();
  }

  protected get panelElement(): ElementRef<HTMLElement> | undefined {
    return this.panel();
  }
}
