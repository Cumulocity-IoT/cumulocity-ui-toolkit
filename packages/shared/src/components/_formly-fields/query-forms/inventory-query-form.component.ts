import { Component, input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { DynamicQueryFormComponent } from './dynamic-query-form.component';

@Component({
  selector: 'ps-inventory-query-form',
  template: `<ps-dynamic-query-form
    [filter]="filter()"
    [params]="queryParams"
  ></ps-dynamic-query-form>`,
  standalone: true,
  imports: [CoreModule, DynamicQueryFormComponent],
})
export class InventoryQueryFormComponent {
  filter = input<Record<string, unknown>>({});
  queryParams = [
    {
      title: 'fragmentType',
      type: 'string',
      description:
        'A characteristic which identifies a managed object or event, for example, geolocation, electricity sensor, relay state.',
    },
    {
      title: 'ids',
      type: 'string',
      description: 'The managed object IDs to search for (comma separated).',
    },
    {
      title: 'owner',
      type: 'string',
      description: 'Username of the owner of the managed objects.',
    },
    {
      title: 'query',
      type: 'query-builder',
      description: 'Build a structured OData query using has() and comparison clauses.',
    },
    {
      title: 'text',
      type: 'string',
      description:
        'Search for managed objects where any property value is equal to the given one. Only string values are supported.',
    },
    {
      title: 'type',
      type: 'string',
      description: 'The type of event to search for.',
    },
  ];
}
