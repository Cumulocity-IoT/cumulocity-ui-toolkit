import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';

@Component({
  selector: 'ps-action-bar-dropdown',
  templateUrl: './action-bar-dropdown.component.html',
  standalone: true,
  imports: [CoreModule, BsDropdownModule],
})
export class ActionBarDropdown {
  @Input() placement: 'left' | 'right' = 'left';

  @Input() title: string;

  @Input() items: ActionBarDropdownItem[] = [];

  @Output() selectionChange = new EventEmitter<ActionBarDropdownItem>();

  changeSelection(item: ActionBarDropdownItem) {
    item.selected = true;
    this.items.forEach((r) => {
      if (r !== item) r.selected = false;
    });
    this.selectionChange.emit(item);
  }
}

export interface ActionBarDropdownItem {
  label: string;
  icon: string;
  styleClass: string;
  selected: boolean;
}
