import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { gettext } from '@c8y/ngx-components/gettext';

@Component({
  standalone: true,
  selector: 'app-smart-view-configuration',
  templateUrl: './smart-view-configuration.component.html',
  styleUrls: ['./smart-view-configuration.component.less'],
  imports: [CommonModule],
})
export class SmartViewConfigurationComponent {
  readonly labels = {
    title: gettext('Smart views configuration'),
    description: gettext('Manage and configure smart views for your devices.'),
  };
}
