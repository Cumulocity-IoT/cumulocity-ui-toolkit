import { TestBed } from '@angular/core/testing';
import { AlertService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { BsModalService } from 'ngx-bootstrap/modal';
import type { ReleaseNote } from '../../models/release-notes.model';
import { ReleaseNotesService } from '../../services/release-notes.service';
import { ReminderNotesAdminListComponent } from './admin-list.component';

describe('ReminderNotesAdminListComponent', () => {
  it('says that deleting failed — not updating — when a delete fails', async () => {
    const danger = jasmine.createSpy('danger');

    TestBed.configureTestingModule({
      imports: [ReminderNotesAdminListComponent],
      providers: [
        {
          provide: ReleaseNotesService,
          useValue: {
            delete: () => Promise.reject(new Error('403')),
            list: () => Promise.resolve([]),
          },
        },
        { provide: AlertService, useValue: { danger, success: jasmine.createSpy('success') } },
        { provide: BsModalService, useValue: {} },
        { provide: TranslateService, useValue: { instant: (key: string) => key } },
      ],
    }).overrideComponent(ReminderNotesAdminListComponent, { set: { imports: [], template: '' } });

    const component = TestBed.createComponent(ReminderNotesAdminListComponent).componentInstance;

    await component.delete({ id: '1', version: '1.2.0' } as ReleaseNote);

    expect(danger).toHaveBeenCalledWith('Could not delete release note', jasmine.anything());
  });
});
