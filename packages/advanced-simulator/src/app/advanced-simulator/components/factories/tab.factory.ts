import { Injectable } from '@angular/core';
import { Tab, TabFactory } from '@c8y/ngx-components';
import { Observable } from 'rxjs';

@Injectable()
export class CustomTabFactory implements TabFactory {
  get(): Observable<Tab[] | Tab> | Promise<Tab[] | Tab> | Tab[] | Tab {
    const tabArray = new Array<Tab>();

    tabArray.push(
      {
        label: 'Simulators',
        icon: 'c8y-icon-duocolor c8y-icon-simulator c8y-icon',
        path: `simulators`,
        priority: 100,
      },
      {
        label: 'Templates',
        icon: 'fa fw fa-resume',
        path: `templates`,
        priority: 99,
      }
    );

    return tabArray;
  }
}
