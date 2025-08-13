import { Component, Input } from '@angular/core';
import { CoreModule } from '@c8y/ngx-components';

@Component({
  selector: 'ps-action-bar-reload-button',
  templateUrl: './reload-button.component.html',
  standalone: true,
  imports: [CoreModule],
})
export class ActionBarReloadButton {
  // eslint-disable-next-line
  @Input() refreshCallBack: () => Promise<any>;
  @Input() placement: 'left' | 'right' = 'left';

  requestInProgress = false;

  protected async refresh(): Promise<void> {
    this.requestInProgress = true;

    try {
      await this.refreshCallBack();
      this.requestInProgress = false;
    } finally {
      this.requestInProgress = false;
    }
  }
}
