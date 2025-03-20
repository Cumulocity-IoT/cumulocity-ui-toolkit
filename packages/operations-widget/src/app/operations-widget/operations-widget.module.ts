import { CommonModule } from '@angular/common';
import { NgModule } from '@angular/core';
import { CoreModule, hookComponent } from '@c8y/ngx-components';
import { BsDropdownModule } from 'ngx-bootstrap/dropdown';
import { ButtonInstanceComponent } from './components/button-instance/button-instance.component';
import { OperationsValueComponent } from './components/operations-value/operations-value.component';
import { OperationsWidgetComponent } from './components/operations-widget/operations-widget.component';
import { OperationsWidgetConfigComponent } from './components/widget-config/operations-widget-config.component';

@NgModule({
  imports: [CommonModule, CoreModule, BsDropdownModule],
  declarations: [
    OperationsWidgetComponent,
    OperationsWidgetConfigComponent,
    ButtonInstanceComponent,
    OperationsValueComponent,
  ],
  providers: [
    hookComponent({
      id: 'operations.widget',
      label: 'Operation Button Widget',
      description: '',
      component: OperationsWidgetComponent,
      configComponent: OperationsWidgetConfigComponent,
      previewImage: require('./assets/preview.png') as string,
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
