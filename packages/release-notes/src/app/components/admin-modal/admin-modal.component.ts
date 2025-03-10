import { Component, inject, Input } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { AlertService } from '@c8y/ngx-components';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ReleaseNote } from '../../release-notes.model';
import { ReleaseNotesService } from '../../services/release-notes.service';

@Component({
  selector: 'c8y-release-notes-admin-modal',
  templateUrl: './admin-modal.component.html',
})
export class ReminderNotesAdminModalComponent {
  private releaseNoteServive = inject(ReleaseNotesService);
  private bsModalRef = inject(BsModalRef);
  private translateService = inject(TranslateService);
  private alertService = inject(AlertService);

  @Input() get release(): ReleaseNote {
    return this._release;
  }
  set release(release: ReleaseNote) {
    this._release = {
      id: release.id,
      version: release.version,
      published: release.published || false,
      publicationTime: release.publicationTime,
      body: release.body || '',
    };
  }

  preview = false;
  form = new FormGroup({});
  fields: FormlyFieldConfig[] = [
    {
      fieldGroup: [
        {
          key: 'version',
          type: 'input',
          props: {
            label: this.translateService.instant('Version'),
            required: true,
          },
        },
        {
          key: 'published',
          type: 'checkbox',
          defaultValue: false,
          props: {
            label: this.translateService.instant('Published'),
          },
        },
        {
          key: 'body',
          type: 'textarea',
          props: {
            label: this.translateService.instant('Body'),
          },
        },
      ],
    },
  ];

  isLoading = false;

  get body(): string {
    return this.form.value['body'] || '';
  }

  private _release: ReleaseNote;

  close(): void {
    this.bsModalRef.hide();
  }

  async submit(): Promise<void> {
    this.isLoading = true;
    const release = this.form.value as ReleaseNote;

    if (this.release?.id) {
      // update
      try {
        release.id = this.release.id;
        release.publicationTime = this.release.publicationTime;

        await this.releaseNoteServive.update(release as ReleaseNote);

        this.alertService.success(`Release ${release.version} updated`);
        this.close();
      } catch (error) {
        this.alertService.danger('Could not update release', error as string);
      }
    } else {
      // create
      try {
        if (this.form.value['published']) release.publicationTime = new Date();

        await this.releaseNoteServive.create(release);

        this.alertService.success(`Release ${release.version} created`);
        this.close();
      } catch (error) {
        this.alertService.danger('Could not create release', error as string);
      }
    }
    this.isLoading = false;
  }
}
