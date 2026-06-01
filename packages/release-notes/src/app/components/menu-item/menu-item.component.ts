import { Component, inject } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { ReleaseNotesService } from '../../services/release-notes.service';

@Component({
  selector: 'c8y-release-notes-menu-item',
  templateUrl: './menu-item.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class ReleaseNotesMenuItemComponent {
  private releaseNotesService = inject(ReleaseNotesService);

  openModal(): void {
    this.releaseNotesService.openReleaseNotesModal();
  }
}
