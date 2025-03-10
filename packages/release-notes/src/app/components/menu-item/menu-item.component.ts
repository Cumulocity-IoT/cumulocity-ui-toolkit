import { Component, inject } from '@angular/core';
import { ReleaseNotesService } from '../../services';


@Component({
  selector: 'c8y-release-notes-menu-item',
  templateUrl: './menu-item.component.html',
})
export class ReleaseNotesMenuItemComponent {
  private releaseNotesService = inject(ReleaseNotesService);

  open(): void {
    this.releaseNotesService.openReleaseNotesModal();
  }
}
