import { Component, Input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { DynamicQueryFormComponent } from './dynamic-query-form.component';
import { getTextInputBlock } from './formly-query-blocks';

@Component({
  selector: 'ps-inventory-query-form',
  template: `<ps-dynamic-query-form [filter]="filter" [params]="queryParams"
    ><ng-content></ng-content
  ></ps-dynamic-query-form>`,
  standalone: true,
  imports: [CoreModule, DynamicQueryFormComponent],
})
export class InventoryQueryFormComponent {
  @Input() filter = {};
  queryParams = [
    getTextInputBlock({
      key: 'fragmentType',
      description:
        'A characteristic which identifies a managed object or event, for example, geolocation, electricity sensor, relay state.',
      label: 'Fragment Type',
    }),

    getTextInputBlock({
      key: 'ids',
      description: 'The managed object IDs to search for (comma separated).',
      label: 'Ids',
    }),

    getTextInputBlock({
      key: 'owner',
      description: 'Username of the owner of the managed objects.',
      label: 'Owner',
    }),

    getTextInputBlock({
      key: 'query',
      description:
        'Use query language to perform operations and/or filter the results. See: https://cumulocity.com/api/core/#tag/Query-language',
      label: 'Query',
    }),

    getTextInputBlock({
      key: 'text',
      description:
        'Search for managed objects where any property value is equal to the given one. Only string values are supported.',
      label: 'Text',
    }),

    getTextInputBlock({
      key: 'type',
      description: 'The type of event to search for.',
      label: 'Type',
    }),
  ];
}
