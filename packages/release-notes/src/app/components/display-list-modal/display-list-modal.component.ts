import { Component, inject, OnInit } from '@angular/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ReleaseNote } from '../../release-notes.model';
import { ReleaseNotesService } from '../../services';

@Component({
  selector: 'c8y-release-notes-display-list-modal',
  templateUrl: './display-list-modal.component.html',
  styleUrl: './display-list-modal.component.scss',
})
export class ReleaseNotesDisplayListModalComponent implements OnInit {
  private bsModalRef = inject(BsModalRef);
  private releaseNoteServive = inject(ReleaseNotesService);

  releaseNotes: ReleaseNote[];
  showOnlyNewReleases = false;

  async ngOnInit(): Promise<void> {
    this.releaseNotes = await this.releaseNoteServive.list(this.showOnlyNewReleases);
    this.releaseNoteServive.setLastChecked();
  }

  close(): void {
    this.bsModalRef.hide();
  }
}
