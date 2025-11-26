import { Component, inject, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { ActivatedRoute, ActivatedRouteSnapshot } from '@angular/router';
import { EventService, IEvent, IManagedObject, InventoryService, IResult } from '@c8y/client';
import { AlertService } from '@c8y/ngx-components';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { TranslateService } from '@ngx-translate/core';
import { cloneDeep, has } from 'lodash';
import moment from 'moment';
import { BsModalRef } from 'ngx-bootstrap/modal';
import {
  Reminder,
  REMINDER_TEXT_LENGTH,
  REMINDER_TYPE,
  REMINDER_TYPE_FRAGMENT,
  ReminderStatus,
  ReminderType,
} from '../../models/reminder.model';
import { ReminderService } from '../../services/reminder.service';

interface FormlySelectOptions {
  label: string;
  value: string;
  group?: string;
}

@Component({
  selector: 'c8y-reminder-modal',
  templateUrl: './reminder-modal.component.html',
  standalone: false,
})
export class ReminderModalComponent implements OnInit {
  private activatedRoute = inject(ActivatedRoute);
  private alertService = inject(AlertService);
  private bsModalRef = inject(BsModalRef);
  private eventService = inject(EventService);
  private inventoryService = inject(InventoryService);
  private reminderService = inject(ReminderService);
  private translateService = inject(TranslateService);

  asset!: Partial<IManagedObject>;
  typeOptions!: FormlySelectOptions[];
  isLoading = false;
  form = new FormGroup({});

  reminder: Partial<Reminder> = {
    source: undefined,
    text: undefined,
    time: undefined,
    type: REMINDER_TYPE,
  };

  fields: FormlyFieldConfig[] = [
    {
      fieldGroup: [
        {
          key: 'source',
          type: 'asset',
          props: {
            label: this.translateService.instant('Attach to') as string,
            required: true,
            asset: this.asset,
          },
        },
        {
          key: 'text',
          type: 'input',
          props: {
            label: this.translateService.instant('Message') as string,
            required: true,
            maxLength: REMINDER_TEXT_LENGTH,
            // TODO show max length & used chars
          },
        },
        {
          key: 'time',
          type: 'time',
          defaultValue: moment().add(1, 'minute').toISOString(),
          props: {
            label: this.translateService.instant('Remind me on') as string,
            required: true,
            minDate: moment(),
          },
        },
      ],
    },
  ];

  constructor() {
    this.setTypeField();
  }

  ngOnInit(): void {
    const asset = this.getAssetFromRoute(this.activatedRoute.snapshot);

    if (asset && asset.id) {
      this.asset = asset;
      this.reminder.source = { id: asset.id, name: this.asset['name'] as string };

      this.fields[0].fieldGroup[0].props['asset'] = this.reminder.source;
    }
  }

  /**
   * Closes the modal dialog.
   * @returns {void}
   */
  close(): void {
    this.bsModalRef.hide();
  }

  /**
   * Submits the reminder form, creates a new reminder event, and displays success or error messages.
   * @returns {Promise<void>} A promise that resolves when the submission process is complete.
   */
  async submit(): Promise<void> {
    this.isLoading = true;

    if (!this.reminder.source || !this.reminder.text) return;

    const reminder: IEvent = {
      source: this.reminder.source,
      type: REMINDER_TYPE,
      reminderType: this.reminder.reminderType || null,
      time: moment(this.reminder.time).seconds(0).toISOString(),
      text: this.reminder.text,
      status: ReminderStatus.active,
    };

    // check if need to fetch source to determine if its a group or device, to be able to build the details url
    const source =
      this.reminder.source.id === this.asset?.id
        ? this.asset
        : (await this.inventoryService.detail(this.reminder.source.id)).data;

    if (has(source, 'c8y_IsDeviceGroup')) reminder['isGroup'] = {};

    let request: IResult<IEvent> | undefined;

    try {
      request = await this.eventService.create(reminder);
    } catch (error) {
      console.error(error);
    }

    this.isLoading = false;

    if (!request) return;

    if (request && request.res.status === 201) {
      this.alertService.success(this.translateService.instant('Reminder created') as string);
      this.close();
    } else {
      this.alertService.danger(
        this.translateService.instant('Could not create reminder') as string,
        await request.res.text()
      );
    }
  }

  /**
   * Recursively searches for context data in the route hierarchy.
   * @param {ActivatedRouteSnapshot} route - The current route snapshot.
   * @param {number} [numberOfCheckedParents=0] - The number of parent routes checked so far.
   * @returns {IManagedObject | undefined} The managed object context data, if found.
   */
  private recursiveContextSearch(
    route: ActivatedRouteSnapshot,
    numberOfCheckedParents = 0
  ): IManagedObject | undefined {
    let context: { contextData: IManagedObject } | undefined = undefined;

    if (route?.data['contextData']) {
      context = route.data as { contextData: IManagedObject };
    } else if (route?.firstChild?.data['contextData']) {
      context = route.firstChild.data as { contextData: IManagedObject };
    }

    if (!context) return undefined;

    return context['contextData']
      ? cloneDeep(context['contextData'])
      : route.parent && numberOfCheckedParents < 3
        ? this.recursiveContextSearch(route.parent, numberOfCheckedParents + 1)
        : undefined;
  }

  /**
   * Retrieves the asset from the current route.
   * @param {ActivatedRouteSnapshot} route - The current route snapshot.
   * @returns {IManagedObject | undefined} The managed object representing the asset, if found.
   */
  private getAssetFromRoute(route: ActivatedRouteSnapshot): IManagedObject | undefined {
    if (!route) console.error('No Route provided');
    else {
      const mo = this.recursiveContextSearch(route);

      if (has(mo, 'c8y_IsDevice') || has(mo, 'c8y_IsDeviceGroup')) return mo;
    }

    return undefined;
  }

  /**
   * Sets the type field options for the reminder form based on available reminder types.
   * @returns {void}
   */
  private setTypeField(): void {
    this.typeOptions = this.reminderService.types.map((type: ReminderType) => ({
      label: type.name,
      value: type.id,
    }));

    if (!this.typeOptions.length) return;

    this.fields.push({
      key: REMINDER_TYPE_FRAGMENT,
      type: 'select',
      props: {
        label: this.translateService.instant('Reminder type (optional)') as string,
        hidden: this.typeOptions?.length > 0,
        options: this.typeOptions,
      },
    });
  }
}
