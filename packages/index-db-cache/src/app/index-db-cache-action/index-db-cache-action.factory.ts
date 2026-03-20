import { Injectable } from '@angular/core';
import { ActionBarFactory, ActionBarItem } from '@c8y/ngx-components';
import { IndexDbCacheActionComponent } from './index-db-cache-action.component';

@Injectable()
export class IndexDbCacheActionFactory implements ActionBarFactory {
  private readonly ACTION: ActionBarItem = {
    priority: 100,
    placement: 'right',
    template: IndexDbCacheActionComponent,
  };

  get() {
    return this.ACTION;
  }
}
