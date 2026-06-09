import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { InventoryService } from '@c8y/client';
import { IManagedObject } from '@c8y/client';
import { inject } from '@angular/core';
import { gettext } from '@c8y/ngx-components/gettext';
import { CoreModule } from '@c8y/ngx-components';

@Component({
  standalone: true,
  selector: 'app-smart-view',
  templateUrl: './smart-view.component.html',
  styleUrls: ['./smart-view.component.less'],
  imports: [CoreModule],
})
export class SmartViewComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly inventoryService = inject(InventoryService);

  readonly managedObject = signal<IManagedObject | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);

  readonly labels = {
    loading: gettext('Loading device…'),
    notFound: gettext('Device not found.'),
    id: gettext('ID'),
    name: gettext('Name'),
    type: gettext('Type'),
    lastUpdated: gettext('Last updated'),
  };

  async ngOnInit(): Promise<void> {
    const deviceId = this.route.snapshot.paramMap.get('deviceId');
    if (!deviceId) {
      this.errorMessage.set('No device ID provided.');
      this.loading.set(false);
      return;
    }

    try {
      const { data } = await this.inventoryService.detail(deviceId);
      this.managedObject.set(data);
    } catch {
      this.errorMessage.set(`Could not load managed object with ID "${deviceId}".`);
    } finally {
      this.loading.set(false);
    }
  }
}
