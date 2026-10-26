import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import type { DotSeverity } from '../status-dot/status-dot.model';
import { gettext } from '@c8y/ngx-components/gettext';
import { AssetIconService } from '../../services/asset-store/asset-icon.service';
import { AssetStoreService } from '../../services/asset-store/asset-store.service';
import { AssetTreeService, type QuickAccessEntry } from './asset-tree.service';

/** A quick-access entry resolved against the store — path and status included. */
export interface QuickAccessItem {
  assetId: string;
  label: string;
  icon: string;
  path: string;
  /** Dot severity, or `'gone'` when the store has no such asset any more. */
  severity: DotSeverity;
  unavailable: boolean;
}

/** One rendered section of the panel: Pinned or Recent. */
export interface QuickAccessGroup {
  key: string;
  heading: string;
  items: readonly QuickAccessItem[];
  empty: string;
}

/**
 * The single `★ Pinned & Recent  3+5  ›` row (§6.1).
 *
 * Pinned and Recent used to cost 8–10 permanent rows above the hierarchy, pushing the
 * tree below the fold. They collapse to one row here; the lists live in the **cascade
 * panel** off the container's right edge (`QuickAccessPanelComponent`), and each entry
 * carries its **full path** — the thing the cramped inline list never had room for.
 *
 * The panel is display-only: this row stays the keyboard region and owns the cursor
 * (`aria-activedescendant` pointing into the panel, stitched with `aria-owns`), which is
 * how a hover panel stays fully arrow-key operable. `expanded` therefore means "the
 * panel is open" — the tree owns that state through its `CascadeController`.
 */
@Component({
  selector: 'ps-quick-access-row',
  templateUrl: './quick-access-row.component.html',
  styleUrls: ['./quick-access-row.component.less'],
  imports: [CoreModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickAccessRowComponent {
  /** Whether the cascade panel is open — drives the twisty and the keyboard's reach. */
  readonly expanded = input(false);

  readonly toggled = output<void>();
  /**
   * Open the asset's page via the keyboard: Enter on an entry, modifier for a new tab —
   * the same gestures a hierarchy row honours. The pointer equivalents live on the panel
   * (`QuickAccessPanelComponent.picked`/`activated`), since that is where the entries are.
   */
  readonly activated = output<{ item: QuickAccessItem; newTab: boolean }>();
  /** Arrow-down off the last entry: the hierarchy below takes focus (§3.6). */
  readonly exitDown = output<void>();
  /** Type-ahead, forwarded to the container's filter input exactly as the tree does. */
  readonly typed = output<string>();

  private readonly assets = inject(AssetStoreService);
  private readonly tree = inject(AssetTreeService);
  private readonly icons = inject(AssetIconService);

  protected readonly pinned = computed(() => this.resolve(this.tree.pinned()));
  /** Recents minus anything already pinned — the same asset twice is noise. */
  protected readonly recent = computed(() => {
    const pinnedIds = new Set(this.tree.pinned().map((entry) => entry.assetId));
    return this.resolve(this.tree.recent().filter((entry) => !pinnedIds.has(entry.assetId)));
  });

  protected readonly counts = computed(() => ({
    pinned: this.pinned().length,
    recent: this.recent().length,
  }));

  /** One list to render from, so the entry markup exists exactly once — in the panel. */
  readonly groups = computed<QuickAccessGroup[]>(() => [
    {
      key: 'pinned',
      heading: gettext('Pinned'),
      items: this.pinned(),
      empty: gettext('Pin an asset to keep it here — it also becomes a bookmark.'),
    },
    {
      key: 'recent',
      heading: gettext('Recent'),
      items: this.recent(),
      empty: gettext('Nothing visited yet.'),
    },
  ]);

  /** Keyboard order: the header row first (index `-1`), then Pinned, then Recent. */
  private readonly entries = computed(() => [...this.pinned(), ...this.recent()]);

  private readonly region = viewChild<ElementRef<HTMLElement>>('region');

  /**
   * Raw active index. `-1` = the header row. Clamped on read rather than corrected on
   * write: the lists change under the user (a poll drops a deleted pin, unpinning shortens
   * Pinned), and an index left pointing past the end would silently render no focus at all.
   */
  private readonly rawIndex = signal(-1);

  /**
   * Whether the keyboard is in this section. The active row starts at the header (`-1`), so
   * without this the header drew a focus ring permanently — a box outlined in the tenant's
   * focus colour whether or not anything was focused. Tracked on `focusin`/`focusout`, which
   * (unlike `:focus-visible` on the region) stays true after a click lands on one of the
   * buttons inside — the region still owns the key handling in that state.
   */
  protected readonly hasFocus = signal(false);

  protected readonly activeIndex = computed(() => {
    const count = this.expanded() ? this.entries().length : 0;
    return Math.min(this.rawIndex(), count - 1);
  });

  protected readonly activeDescendant = computed(() => {
    const assetId = this.focusedAssetId();
    return assetId ? this.entryDomId(assetId) : this.headerId;
  });

  protected readonly headerId = 'ps-qa-header';

  protected readonly focusedAssetId = computed(() => {
    const index = this.activeIndex();
    return index >= 0 ? (this.entries()[index]?.assetId ?? null) : null;
  });

  /**
   * What the panel should ring: the cursor, but only while the keyboard is actually in
   * this region — with focus elsewhere the panel must carry no ring at all (the header
   * once drew one permanently; same regression, one level out).
   */
  readonly panelCursor = computed(() => (this.hasFocus() ? this.focusedAssetId() : null));

  private entryDomId(assetId: string): string {
    return `ps-qa-entry-${assetId}`;
  }

  /**
   * Takes DOM focus, landing on the header row — the tree calls this when the user arrows
   * *up* off its first row. Focus lives on the region, not on a row: the header and the
   * entries are announced through `aria-activedescendant`, the same pattern the hierarchy
   * viewport uses, so the two sections behave identically to a keyboard.
   */
  focusRegion(): void {
    this.rawIndex.set(-1);
    this.region()?.nativeElement.focus({ preventScroll: true });
  }

  /**
   * `focusout` bubbles from the buttons inside too, and fires *before* the matching
   * `focusin` — so moving from the header to an entry would blank the ring for a frame.
   * Only a target outside the region counts as leaving.
   */
  protected onFocusOut(event: FocusEvent): void {
    const next = event.relatedTarget;

    if (next instanceof Node && this.region()?.nativeElement.contains(next)) return;
    this.hasFocus.set(false);
  }

  protected onKeydown(event: KeyboardEvent): void {
    const entries = this.expanded() ? this.entries() : [];
    const index = this.activeIndex();

    switch (event.key) {
      case 'ArrowDown':
        // Off the end (or out of a collapsed row) means "into the hierarchy" — the two
        // sections read as one vertical run even though they are separate trees.
        if (index + 1 < entries.length) this.rawIndex.set(index + 1);
        else this.exitDown.emit();
        break;
      case 'ArrowUp':
        // Stops at the header: this is the topmost section, there is nothing above it.
        this.rawIndex.set(Math.max(-1, index - 1));
        break;
      case 'ArrowRight':
        if (index >= 0) return; // An entry is a leaf — nothing to descend into.
        if (!this.expanded()) this.toggled.emit();
        else if (entries.length) this.rawIndex.set(0);
        break;
      case 'ArrowLeft':
        // Out of the list back to the header, then closed — one level per press, as in
        // the hierarchy.
        if (index >= 0) this.rawIndex.set(-1);
        else if (this.expanded()) this.toggled.emit();
        break;

      case 'Enter': {
        // On the header Enter is the twisty; on an entry it opens, exactly as in the
        // hierarchy where Enter is the only key that navigates.
        const entry = entries[index];

        if (index < 0) this.toggled.emit();
        else if (entry) {
          this.activated.emit({
            item: entry,
            newTab: event.altKey || event.metaKey || event.ctrlKey,
          });
        }
        break;
      }
      case 'Home':
        this.rawIndex.set(-1);
        break;
      case 'End':
        this.rawIndex.set(entries.length - 1);
        break;
      case 'Escape':
        // Innermost first, as everywhere in the cascade: an open panel closes and the
        // event stops; with nothing open it still bubbles so the container can close.
        if (!this.expanded()) return;
        this.rawIndex.set(-1);
        this.toggled.emit();
        event.stopPropagation();
        break;
      default:
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          this.typed.emit(event.key);
          break;
        }

        return;
    }
    event.preventDefault();
  }

  private resolve(entries: readonly QuickAccessEntry[]): QuickAccessItem[] {
    return entries.map((entry) => {
      const node = this.assets.node(entry.assetId);

      if (!node) {
        // Deleted, or the user lost access. Shown as unavailable rather than dropped:
        // silently vanishing pins look like the pin never saved.
        return {
          assetId: entry.assetId,
          label: entry.label,
          icon: entry.icon ?? 'help',
          path: '',
          severity: 'gone' as const,
          unavailable: true,
        };
      }
      const rollup = this.assets.rollupOf(entry.assetId);
      return {
        assetId: entry.assetId,
        label: node.name,
        icon: this.icons.iconFor(node),
        path: this.assets.pathLabel(entry.assetId),
        severity: rollup.worst ?? 'ok',
        unavailable: rollup.unavailableCount > 0 || node.availability === 'unavailable',
      };
    });
  }
}
