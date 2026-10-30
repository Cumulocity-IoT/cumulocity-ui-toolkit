import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { StatusDotComponent } from '../status-dot/status-dot.component';
import type { QuickAccessGroup, QuickAccessItem } from './quick-access-row.component';

/**
 * The Pinned & Recent lists, as cascade-panel content (level 1, §6.1).
 *
 * Deliberately presentational: the lists, the keyboard cursor and every gesture's meaning
 * live in `QuickAccessRowComponent` — the header row remains the one keyboard region, and
 * this panel only renders what it is handed. That is what lets the arrow keys drive a
 * hover panel, the objection that killed the first cascade version: focus never has to
 * *enter* the panel, the row's `aria-activedescendant` just points at entries rendered
 * here (stitched to the region with `aria-owns`).
 */
@Component({
  selector: 'ps-quick-access-panel',
  template: `
    <div class="ps-qa-lists" id="ps-qa-panel" role="group">
      @for (group of groups(); track group.key) {
        <p class="ps-qa-lists__heading text-muted">{{ group.heading | translate }}</p>
        @if (group.items.length) {
          <ul class="ps-qa-lists__list">
            @for (item of group.items; track item.assetId) {
              <li>
                <button
                  class="ps-qa-entry"
                  [id]="'ps-qa-entry-' + item.assetId"
                  [class.ps-qa-entry--focused]="focusedAssetId() === item.assetId"
                  (click)="onEntryClick($event, item)"
                  (dblclick)="activated.emit({ item, newTab: false })"
                  type="button"
                  role="treeitem"
                >
                  <span class="ps-qa-entry__top d-flex a-i-center">
                    <i [c8yIcon]="item.icon" aria-hidden="true"></i>
                    <span class="text-truncate">{{ item.label }}</span>
                    <ps-status-dot
                      class="m-l-auto"
                      [severity]="item.severity"
                      [unavailable]="item.unavailable"
                    />
                  </span>
                  <!-- The full path — the reason this panel is worth opening (§6.1, AC-T7). -->
                  <span class="ps-qa-entry__path text-muted text-truncate">
                    {{ item.path || ('No longer available' | translate) }}
                  </span>
                </button>
              </li>
            }
          </ul>
        } @else {
          <p class="ps-qa-lists__empty text-muted">{{ group.empty | translate }}</p>
        }
      }
    </div>
  `,
  styleUrls: ['./quick-access-panel.component.less'],
  imports: [CoreModule, StatusDotComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class QuickAccessPanelComponent {
  readonly groups = input.required<readonly QuickAccessGroup[]>();
  /** The row's keyboard cursor, or `null` while the region is unfocused — drives the ring. */
  readonly focusedAssetId = input<string | null>(null);

  readonly picked = output<QuickAccessItem>();
  readonly activated = output<{ item: QuickAccessItem; newTab: boolean }>();

  protected onEntryClick(event: MouseEvent, item: QuickAccessItem): void {
    if (event.altKey || event.metaKey || event.ctrlKey) {
      this.activated.emit({ item, newTab: true });

      return;
    }
    this.picked.emit(item);
  }
}
