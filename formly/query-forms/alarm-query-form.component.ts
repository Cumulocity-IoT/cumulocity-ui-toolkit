import { Component, Input } from '@angular/core';
import { Severity, AlarmStatus } from '@c8y/client';
import { CoreModule } from '@c8y/ngx-components';
import { DynamicQueryFormComponent } from './dynamic-query-form.component';

@Component({
  selector: 'ps-alarm-query-form',
  template: `<ps-dynamic-query-form [filter]="filter" [params]="queryParams"></ps-dynamic-query-form>`,
  standalone: true,
  imports: [CoreModule, DynamicQueryFormComponent],
})
export class AlarmQueryFormComponent {
  @Input() filter = {};
  queryParams = [
    {
      title: 'createdFrom',
      type: 'date',
      description: 'Start date or date and time of the alarm creation.',
    },
    {
      title: 'createdTo',
      type: 'date',
      description: 'End date or date and time of the alarm creation.',
    },
    {
      title: 'dateFrom',
      type: 'date',
      description: 'Start date or date and time of the alarm occurrence.',
    },
    {
      title: 'dateTo',
      type: 'date',
      description: 'End date or date and time of the alarm occurrence.',
    },
    {
      title: 'resolved',
      type: 'boolean',
      description: 'When set to true only alarms with status CLEARED will be fetched, whereas false will fetch all alarms with status ACTIVE or ACKNOWLEDGED.',
    },
    {
      title: 'type',
      type: 'string',
      description: 'The types of alarm to search for (comma separated).',
    },
    {
      type: 'string',
      enum: Object.keys(Severity),
      title: 'severity',
    },
    {
      type: 'string',
      enum: Object.keys(AlarmStatus),
      title: 'status',
    },
  ];
}
