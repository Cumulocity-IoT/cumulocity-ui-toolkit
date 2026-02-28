import { Component, Input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { DynamicQueryFormComponent } from './dynamic-query-form.component';
import { getDateFromBlock, getDateToBlock, getTextInputBlock } from './formly-query-blocks';

@Component({
  selector: 'ps-event-query-form',
  template: `<ps-dynamic-query-form [filter]="filter" [params]="queryParams"
    ><ng-content></ng-content
  ></ps-dynamic-query-form>`,
  standalone: true,
  imports: [CoreModule, DynamicQueryFormComponent],
})
export class EventQueryFormComponent {
  @Input() filter = {};
  queryParams = [
    getDateFromBlock({
      key: 'createdFrom',
      label: 'Created from',
      description:
        "Start date or date and time of the event's creation (set by the platform during creation).",
    }),
    getDateToBlock({
      key: 'createdTo',
      label: 'Created to',
      description:
        "End date or date and time of the event's creation (set by the platform during creation).",
    }),
    getDateFromBlock({
      key: 'dateFrom',
      label: 'Date from',
      description: 'Start date or date and time of the event occurrence (provided by the device).',
    }),
    getDateToBlock({
      key: 'dateTo',
      label: 'Date to',
      description: 'End date or date and time of the event occurrence (provided by the device).',
    }),
    getTextInputBlock({
      key: 'fragmentType',
      description:
        'A characteristic which identifies a managed object or event, for example, geolocation, electricity sensor, relay state.',
      label: 'Fragment Type',
    }),
    getTextInputBlock({
      key: 'fragmentValue',
      description:
        "Allows filtering events by the fragment's value, but only when provided together with fragmentType (only string values)",
      label: 'Fragment Value',
    }),
    getDateFromBlock({
      key: 'lastUpdatedFrom',
      label: 'Last updated from',
      description: 'Start date or date and time of the last update made.',
    }),
    getDateToBlock({
      key: 'lastUpdatedTo',
      label: 'Last updated to',
      description: 'End date or date and time of the last update made.',
    }),
    {
      key: 'revert',
      type: 'checkbox',
      templateOptions: {
        label: 'Revert',
        description:
          'If you are using a range query (that is, at least one of the dateFrom or dateTo parameters is included in the request), then setting revert=true will sort the results by the oldest events first. By default, the results are sorted by the newest events first.',
      },
    },
    getTextInputBlock({
      key: 'type',
      description: 'The type of event to search for.',
      label: 'Type',
    }),
  ];
}
