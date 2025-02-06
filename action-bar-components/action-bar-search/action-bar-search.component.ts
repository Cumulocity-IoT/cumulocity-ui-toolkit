import { Component, EventEmitter, Input, Output } from '@angular/core';
import { IIdentified, IManagedObject, InventoryService, IResultList } from '@c8y/client';
import { CoreModule } from '@c8y/ngx-components';
import { map, Observable, pipe, UnaryFunction } from 'rxjs';

@Component({
  selector: 'ps-action-bar-search',
  templateUrl: './action-bar-search.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class ActionBarSearchComponent {
  @Input() placement: 'left' | 'right' = 'left';

  devices?: IResultList<IManagedObject>;
  filterPipe?: UnaryFunction<Observable<[]>, Observable<never[]>>;
  pattern = '';
  selected: IIdentified = { id: undefined, name: '' };

  @Input() set filter(value: object) {
    this._filter = { ...value, withTotalPages: true, pageSize: 10 };
  }
  private _filter: object = { fragmentType: 'c8y_IsDevice', query: 'has(c8y_Position)', withTotalPages: true, pageSize: 10 };

  @Output() selectionChange = new EventEmitter<IManagedObject>();

  constructor(private inventory: InventoryService) {
    this.loadDevices();
  }

  loadDevices() {
    this.inventory.list(this._filter).then((devices) => (this.devices = devices));
  }

  setPipe(filterStr: string) {
    this.pattern = filterStr;
    this.filterPipe = pipe(
      map((data: []) => {
        return data.filter((mo: any) => mo.name && mo.name.toLowerCase().indexOf(filterStr.toLowerCase()) > -1);
      })
    );
  }

  onIconClick(event: { icon: string; $event: MouseEvent }) {
    if (event.icon === 'cross-circle') {
      this.selected = { id: undefined, name: '' };
      this.selectionChange.emit(undefined);
    }
  }

  changeSelection(device: IManagedObject & { name: string }) {
    this.selected = device;
    this.setPipe('');
    this.selectionChange.emit(device);
  }
}
