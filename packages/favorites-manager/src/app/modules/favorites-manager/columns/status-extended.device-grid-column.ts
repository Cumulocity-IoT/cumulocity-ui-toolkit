import { StatusDeviceGridColumn } from '@c8y/ngx-components/device-grid';
import { StatusExtendedCellRendererComponent } from './status-extended.cell-renderer.component';

export class StatusExtendedDeviceGridColumn extends StatusDeviceGridColumn {
  constructor() {
    super();

    this.cellRendererComponent = StatusExtendedCellRendererComponent;
  }
}
