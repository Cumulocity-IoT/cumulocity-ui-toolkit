import { Component, inject, OnInit } from '@angular/core';
import { AlertService } from '@c8y/ngx-components';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ReleaseNote } from '../../models/release-notes.model';
import { ReleaseNotesService } from '../../services/release-notes.service';
import { ReminderNotesAdminModalComponent } from '../admin-modal/admin-modal.component';

@Component({
  selector: 'c8y-release-notes-admin-list',
  templateUrl: './admin-list.component.html',
  styleUrl: './admin-list.component.scss',
})
export class ReminderNotesAdminListComponent implements OnInit {
  private releaseNoteServive = inject(ReleaseNotesService);
  private alertService = inject(AlertService);
  private modalService = inject(BsModalService);

  releaseNotes: ReleaseNote[];
  isLoading = false;

  ngOnInit(): void {
    void this.reload();
  }

  add(): void {
    const ref = this.modalService.show(ReminderNotesAdminModalComponent, {
      class: 'modal-md',
    });
    ref.onHidden.subscribe(() => this.reload());
  }

  async delete(release: ReleaseNote): Promise<void> {
    try {
      await this.releaseNoteServive.delete(release.id);
      this.alertService.success(`Release ${release.version} deleted`);
    } catch (error) {
      this.alertService.danger('Could not update release note', error as string);
    }
  }

  edit(release: ReleaseNote): void {
    const ref = this.modalService.show(ReminderNotesAdminModalComponent, {
      class: 'modal-md',
      initialState: { release },
    });
    ref.onHidden.subscribe(() => this.reload());
  }

  async reload(): Promise<void> {
    this.isLoading = true;
    this.releaseNotes = [];
    this.releaseNotes = await this.releaseNoteServive.list(false, false, 2000);
    this.isLoading = false;
  }

  async publish(release: ReleaseNote, isPublished: boolean): Promise<void> {
    try {
      await this.releaseNoteServive.publish(release, isPublished);
      this.alertService.success(
        `Release note ${release.version} ${isPublished ? 'published' : 'unpublished'}`
      );
    } catch (error) {
      console.error(error);
    }
  }
}
