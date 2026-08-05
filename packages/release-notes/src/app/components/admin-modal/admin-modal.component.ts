import { Component, inject, Input, OnInit } from '@angular/core';
import { FormGroup, ReactiveFormsModule } from '@angular/forms';
import { AlertService, CoreModule } from '@c8y/ngx-components';
import { gettext } from '@c8y/ngx-components/gettext';
import { FormlyModule } from '@ngx-formly/core';
import { CollapseModule } from 'ngx-bootstrap/collapse';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { ReleaseNote } from '../../models/release-notes.model';
import { ReleaseNotesService } from '../../services/release-notes.service';

@Component({
  selector: 'c8y-release-notes-admin-modal',
  templateUrl: './admin-modal.component.html',
  standalone: true,
  imports: [CoreModule, ReactiveFormsModule, FormlyModule, CollapseModule],
})
export class ReminderNotesAdminModalComponent implements OnInit {
  private releaseNotesService = inject(ReleaseNotesService);
  private bsModalRef = inject(BsModalRef);
  private translateService = inject(TranslateService);
  private alertService = inject(AlertService);

  // TODO use signal/model
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
  /**
   * Built in `ngOnInit` rather than as a field initialiser: no formly translate
   * extension is registered in this workspace, so the labels have to be resolved
   * eagerly — but a field initialiser runs before the translation bundle is
   * guaranteed to be loaded.
   */
  fields: FormlyFieldConfig[] = [];

  isLoading = false;

  ngOnInit(): void {
    this.fields = [
      {
        fieldGroup: [
          {
            key: 'version',
            type: 'input',
            props: {
              label: this.translateService.instant(gettext('Version')) as string,
              required: true,
            },
          },
          {
            key: 'published',
            type: 'checkbox',
            defaultValue: false,
            props: {
              label: this.translateService.instant(gettext('Published')) as string,
            },
          },
          {
            key: 'body',
            type: 'textarea',
            props: {
              label: this.translateService.instant(gettext('Body')) as string,
            },
          },
        ],
      },
    ];
  }

  /** Formly drives the control set, so the value is read through the model shape. */
  private get formValue(): Partial<ReleaseNote> {
    return this.form.value;
  }

  get body(): string {
    return this.formValue.body || '';
  }

  private _release!: ReleaseNote;

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

        await this.releaseNotesService.update(release);

        this.alertService.success(
          this.translateService.instant('Release {{version}} updated', {
            version: release.version,
          }) as string
        );
        this.close();
      } catch (error) {
        this.alertService.danger(
          this.translateService.instant('Could not update release') as string,
          error as string
        );
      }
    } else {
      // create
      try {
        if (this.formValue.published) release.publicationTime = new Date();

        await this.releaseNotesService.create(release);

        this.alertService.success(
          this.translateService.instant('Release {{version}} created', {
            version: release.version,
          }) as string
        );
        this.close();
      } catch (error) {
        this.alertService.danger(
          this.translateService.instant('Could not create release') as string,
          error as string
        );
      }
    }
    this.isLoading = false;
  }
}
