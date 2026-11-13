import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { EventService, InventoryService } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { TranslateService } from '@ngx-translate/core';
import { BsModalRef } from 'ngx-bootstrap/modal';
import { provideMock } from '~helpers/auto-mock.helper';
import { ReminderService } from '../../services/reminder.service';
import { ReminderModalComponent } from './reminder-modal.component';

describe('ReminderModalComponent', () => {
  let component: ReminderModalComponent;
  let eventService: jasmine.SpyObj<EventService>;
  let refresh: jasmine.Spy;

  beforeEach(() => {
    refresh = jasmine.createSpy('refresh').and.resolveTo();

    TestBed.configureTestingModule({
      imports: [ReminderModalComponent],
      providers: [
        { provide: ReminderService, useValue: { types: [], refresh } },
        { provide: ActivatedRoute, useValue: { snapshot: {} } },
        { provide: BsModalRef, useValue: { hide: jasmine.createSpy('hide') } },
        provideMock(EventService),
        provideMock(InventoryService),
        provideMock(AlertService),
        provideMock(TranslateService),
      ],
    }).overrideComponent(ReminderModalComponent, {
      // Strip the heavy module imports; this spec only exercises the submit flow.
      set: { imports: [], template: '' },
    });

    component = TestBed.createComponent(ReminderModalComponent).componentInstance;
    eventService = TestBed.inject(EventService) as jasmine.SpyObj<EventService>;
  });

  it('refreshes the reminders after creating one, as they are polled', async () => {
    const source = { id: 'device-1', name: 'Device 1' };

    eventService.create.and.resolveTo({} as never);
    component.asset = source;
    component.reminder = { source, text: 'check', time: new Date().toISOString() };

    await component.submit();

    expect(eventService.create).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('does not refresh when creating the reminder fails', async () => {
    const source = { id: 'device-1', name: 'Device 1' };

    eventService.create.and.rejectWith('failed');
    component.asset = source;
    component.reminder = { source, text: 'check', time: new Date().toISOString() };

    await component.submit();

    expect(refresh).not.toHaveBeenCalled();
  });
});
