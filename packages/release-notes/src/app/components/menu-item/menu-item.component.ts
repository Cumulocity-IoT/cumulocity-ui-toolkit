import { Component, inject } from '@angular/core';
import { ReleaseNotesService } from '../../services/release-notes.service';

@Component({
  selector: 'c8y-release-notes-menu-item',
  templateUrl: './menu-item.component.html',
})
export class ReleaseNotesMenuItemComponent {
  private releaseNotesService = inject(ReleaseNotesService);

  openModal(): void {
    this.releaseNotesService.openReleaseNotesModal();
  }
}
