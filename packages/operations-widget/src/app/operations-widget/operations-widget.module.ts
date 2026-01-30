import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { CoreModule, hookWidget } from '@c8y/ngx-components';
import { assets } from './assets/assets';
import { OperationsWidgetService } from './services/operations-widget.service';

async function loadViewComponent() {
  const { OperationsWidgetComponent } =
    await import('./components/operations-widget/operations-widget.component');
  return OperationsWidgetComponent;
}

async function loadConfigComponent() {
  const { OperationsWidgetConfigComponent } =
    await import('./components/widget-config/operations-widget-config.component');
  return OperationsWidgetConfigComponent;
}
@NgModule({
  imports: [CommonModule, CoreModule],
  providers: [
    OperationsWidgetService,
    hookWidget({
      id: 'operations.widget',
      label: 'Operation Button Widget',
      description: '',
      loadComponent: loadViewComponent,
      loadConfigComponent: loadConfigComponent,
      previewImage: assets.previewImage,
      data: {
        settings: {
          noNewWidgets: false,
          ng1: {
            options: {
              noDeviceTarget: false,
              groupsSelectable: false,
            },
          },
        },
      },
    }),
  ],
})
export class OperationsWidgetModule {}
