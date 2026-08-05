import { Component, input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

@Component({
  selector: 'ps-action-bar-reload-button',
  templateUrl: './action-bar-reload-button.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class ActionBarReloadButtonComponent {
  requestInProgress = false;
  refreshCallBack = input.required<() => Promise<void>>();

  placement = input<'left' | 'right'>('left');

  protected async refresh() {
    this.requestInProgress = true;

    try {
      await this.refreshCallBack()();
      this.requestInProgress = false;
    } finally {
      this.requestInProgress = false;
    }
  }
}
