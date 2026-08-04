import { Component, computed, input } from '@angular/core';
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
  alarm = input<IAlarm>();

  /**
   * Explicit severity/status, used when no `alarm` is bound. These were `model()`s
   * written by an effect, which made derived values look two-way bindable.
   */
  severityInput = input<string | undefined>(undefined, { alias: 'severity' });
  statusInput = input<string | undefined>(undefined, { alias: 'status' });

  /** The alarm wins when one is bound, otherwise the explicit input is used. */
  readonly severity = computed(() => {
    const alarm = this.alarm();

    return alarm ? String(alarm.severity) : this.severityInput();
  });

  readonly status = computed(() => {
    const alarm = this.alarm();

    return alarm ? String(alarm.status) : this.statusInput();
  });
}
