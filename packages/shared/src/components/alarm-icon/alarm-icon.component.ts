import { Component, effect, input, model } from '@angular/core';
import { IAlarm } from '@c8y/client';
import { CoreModule } from '@c8y/ngx-components';
import { TooltipModule } from 'ngx-bootstrap/tooltip';

@Component({
  selector: 'c8y-alarm-icon',
  templateUrl: './alarm-icon.component.html',
  standalone: true,
  imports: [CoreModule, TooltipModule],
})
export class AlarmIconComponent {
  placement = input<'top' | 'right' | 'bottom' | 'left'>('right');
  display = input<'severity' | 'status'>('severity');
  severity = model<string>();
  status = model<string>();

  alarm = input<IAlarm>();

  constructor() {
    effect(() => {
      const alarm = this.alarm();

      if (alarm) {
        this.severity.set(String(alarm.severity));
        this.status.set(String(alarm.status));
      }
    });
  }
}
