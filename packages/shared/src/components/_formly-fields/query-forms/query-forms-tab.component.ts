import { input, model, output, Component, OnInit } from '@angular/core';
import { InventoryQueryFormComponent } from './inventory-query-form.component';
import { CoreModule } from '@c8y/ngx-components';
import { AlarmQueryFormComponent } from './alarm-query-form.component';
import { EventQueryFormComponent } from './event-query-form.component';
import { IAlarm, IEvent, IManagedObject } from '@c8y/client';

export type QueryResult = { filter: object } & (
  | { type: 'Inventory'; data: IManagedObject[] }
  | { type: 'Event'; data: IEvent[] }
  | { type: 'Alarm'; data: IAlarm[] }
);

@Component({
  selector: 'ps-query-forms-tab',
  templateUrl: './query-forms-tab.component.html',
  standalone: true,
  imports: [
    CoreModule,
    InventoryQueryFormComponent,
    AlarmQueryFormComponent,
    EventQueryFormComponent,
  ],
})
export class QueryFormsTabComponent implements OnInit {
  readonly tabChange = output<'Inventory' | 'Alarm' | 'Event'>();
  filter = model<Record<string, unknown>>({});
  hiddenAutoRun = input(false);
  queryType = model<'Inventory' | 'Alarm' | 'Event'>('Inventory');
  /** Tab names that should be rendered but not clickable (e.g. ['Alarm', 'Event'] for asset layers). */
  disabledTabs = input<string[]>([]);

  tabs = [
    {
      active: false,
      icon: '',
      name: 'Inventory',
    },
    {
      active: false,
      icon: '',
      name: 'Alarm',
    },
    {
      active: false,
      icon: '',
      name: 'Event',
    },
  ];

  ngOnInit(): void {
    if (this.queryType()) {
      this.tabs.forEach((t) => {
        t.active = t.name === this.queryType();
      });
    }
  }

  onTabClick(name: string) {
    if (
      (name === 'Inventory' || name === 'Alarm' || name === 'Event') &&
      !this.disabledTabs().includes(name)
    ) {
      this.queryType.set(name);
      this.tabs.forEach((t) => {
        t.active = t.name === name;
      });
      this.filter.set({});
      this.tabChange.emit(name);
    }
  }
}
