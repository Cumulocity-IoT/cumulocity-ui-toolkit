import { Component, inject, OnInit } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ReleaseNote } from '../../models/release-notes.model';
import { ReleaseNotesService } from '../../services/release-notes.service';

@Component({
  selector: 'c8y-release-notes-display-list-modal',
  templateUrl: './display-list-modal.component.html',
  styleUrl: './display-list-modal.component.scss',
  standalone: true,
  imports: [CoreModule],
})
export class ReleaseNotesDisplayListModalComponent implements OnInit {
  private bsModalRef = inject(BsModalRef);
  private releaseNoteService = inject(ReleaseNotesService);

  releaseNotes: ReleaseNote[];
  showOnlyNewReleases = false;

  ngOnInit(): void {
    void this.loadReleaseNotes();
  }

  private async loadReleaseNotes(): Promise<void> {
    this.releaseNotes = await this.releaseNoteService.list(this.showOnlyNewReleases);
    this.releaseNoteService.setLastChecked();
  }

  close(): void {
    this.bsModalRef.hide();
  }
}
