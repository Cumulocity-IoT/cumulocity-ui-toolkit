import { Component, Input } from '@angular/core';
import { Severity, AlarmStatus } from '@c8y/client';
import { CoreModule } from '@c8y/ngx-components';
import { DynamicQueryFormComponent } from './dynamic-query-form.component';
import { FormlyFieldConfig } from '@ngx-formly/core';
import { getDateFromBlock, getDateToBlock } from './formly-query-blocks';

@Component({
  selector: 'ps-alarm-query-form',
  template: `<ps-dynamic-query-form [filter]="filter" [params]="queryParams"
    ><ng-content></ng-content
  ></ps-dynamic-query-form>`,
  standalone: true,
  imports: [CoreModule, DynamicQueryFormComponent],
})
export class AlarmQueryFormComponent {
  @Input() filter = {};
  queryParams: FormlyFieldConfig[] = [
    getDateFromBlock({
      key: 'createdFrom',
      label: 'Created from',
      description: 'Start date or date and time of the alarm creation.',
    }),
    getDateToBlock({
      key: 'createdTo',
      label: 'Created to',
      description: 'End date or date and time of the alarm creation.',
    }),
    getDateFromBlock({
      key: 'dateFrom',
      label: 'Date from',
      description: 'Start date or date and time of the alarm occurrence.',
    }),
    getDateToBlock({
      key: 'dateTo',
      label: 'Date to',
      description: 'End date or date and time of the alarm occurrence.',
    }),
    {
      key: 'resolved',
      type: 'checkbox',
      templateOptions: {
        label: 'Resolved',
        description:
          'When set to true, only alarms with status CLEARED will be fetched. When set to false, alarms with status ACTIVE or ACKNOWLEDGED will be fetched.',
      },
    },
    {
      key: 'type',
      type: 'input',
      templateOptions: {
        label: 'Alarm Type(s)',
        placeholder: 'Enter alarm types (comma separated)',
        description: 'The type of alarm to search for (comma separated).',
      },
    },
    {
      key: 'severity',
      type: 'select',
      defaultValue: Severity.CRITICAL,
      templateOptions: {
        label: 'Severity',
        options: Object.keys(Severity).map((s) => ({ value: s, label: s })),
      },
    },
    {
      key: 'status',
      type: 'select',
      defaultValue: AlarmStatus.ACTIVE,
      templateOptions: {
        label: 'Status',
        options: Object.keys(AlarmStatus).map((s) => ({ value: s, label: s })),
      },
    },
  ];
}
