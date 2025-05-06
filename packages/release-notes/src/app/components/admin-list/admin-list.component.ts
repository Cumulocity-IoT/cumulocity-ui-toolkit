import { Component, inject, OnInit } from '@angular/core';
import { AlertService } from '@c8y/ngx-components';
import { BsModalService } from 'ngx-bootstrap/modal';
import { ReleaseNote } from '../../models/release-notes.model';
import { ReleaseNotesService } from '../../services/release-notes.service';
import { ReminderNotesAdminModalComponent } from '../admin-modal/admin-modal.component';
import { TranslateService } from '@ngx-translate/core';

@Component({
  selector: 'c8y-release-notes-admin-list',
  templateUrl: './admin-list.component.html',
  styleUrl: './admin-list.component.scss',
})
export class ReminderNotesAdminListComponent implements OnInit {
  private releaseNoteServive = inject(ReleaseNotesService);
  private alertService = inject(AlertService);
  private modalService = inject(BsModalService);
  private translateService = inject(TranslateService);

  releaseNotes: ReleaseNote[];
  isLoading = false;

  ngOnInit(): void {
    void this.reload();
  }

  add(): void {
    const ref = this.modalService.show(ReminderNotesAdminModalComponent, {
      class: 'modal-md',
    });

    ref.onHidden.subscribe(() => {
      void this.reload();
    });
  }

  async delete(release: ReleaseNote): Promise<void> {
    try {
      await this.releaseNoteServive.delete(release.id);
      this.alertService.success(
        this.translateService.instant('Release {{version}} deleted', {
          version: release.version,
        }) as string
      );
    } catch (error) {
      this.alertService.danger(
        this.translateService.instant('Could not update release note') as string,
        error as string
      );
    }
  }

  edit(release: ReleaseNote): void {
    const ref = this.modalService.show(ReminderNotesAdminModalComponent, {
      class: 'modal-md',
      initialState: { release },
    });

    ref.onHidden.subscribe(() => {
      void this.reload();
    });
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
        isPublished
          ? (this.translateService.instant('Release note {{version}} published', {
              version: release.version,
            }) as string)
          : (this.translateService.instant('Release note {{version}} unpublished', {
              version: release.version,
            }) as string)
      );
    } catch (error) {
      console.error(error);
    }
  }
}
