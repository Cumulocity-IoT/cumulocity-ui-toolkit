import { Component, Input } from '@angular/core';
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
  @Input() placement: 'top' | 'right' | 'bottom' | 'left' = 'right';
  @Input() display: 'severity' | 'status' = 'severity';
  @Input() severity: string;
  @Input() status: string;

  @Input() set alarm(alarm: IAlarm) {
    this.severity = String(alarm.severity);
    this.status = String(alarm.status);
  }
}
