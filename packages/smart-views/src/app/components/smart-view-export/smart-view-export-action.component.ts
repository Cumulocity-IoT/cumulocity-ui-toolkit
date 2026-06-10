import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { BsModalService } from 'ngx-bootstrap/modal';
import { SmartViewExportModalComponent } from './smart-view-export-modal.component';

/**
 * Action-bar button that opens the Smart View CSV export modal.
 *
 * The selector targets `li` so the component renders directly inside the
 * action bar's `<li>` element without introducing an extra wrapper node.
 */
@Component({
  standalone: true,
  selector: 'li[appSmartViewExportAction]',
  template: `
    <button
      class="btn btn-link"
      type="button"
      [title]="label"
      [attr.aria-label]="label"
      (click)="openModal()"
    >
      <i c8yIcon="download-archive"></i>
      {{ label }}
    </button>
  `,
  imports: [CoreModule],
})
export class SmartViewExportActionComponent {
  private readonly modalService = inject(BsModalService);
  private readonly activatedRoute = inject(ActivatedRoute);

  readonly label = gettext('Export CSV');

  openModal(): void {
    const smartViewId = this.resolveSmartViewId();

    if (!smartViewId) {
      return;
    }

    this.modalService.show(SmartViewExportModalComponent, {
      class: 'modal-md',
      initialState: { smartViewId },
    });
  }

  /**
   * Walks the activated route snapshot downwards until it finds a segment that
   * carries an `id` param — the `smart-views/:id` route. Same traversal used
   * by `SmartViewComponent` and the action-bar factory.
   */
  private resolveSmartViewId(): string | null {
    let route = this.activatedRoute.snapshot;

    while (route) {
      const id = route.paramMap.get('id');

      if (id) {
        return id;
      }

      route = route.firstChild ?? null!;
    }

    return null;
  }
}
