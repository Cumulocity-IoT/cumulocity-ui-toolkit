// Assets need to be imported into the module, or they are not available
import { NgModule } from '@angular/core';
import { hookNavigator, hookRoute } from '@c8y/ngx-components';
import { TenantOptionManagementService } from './tenant-option-management.service';

@NgModule({
  providers: [
    TenantOptionManagementService,
    hookRoute({
      path: 'tenant-option-management',
      loadComponent: () =>
        import('./tenant-option-management.component').then(
          (m) => m.TenantOptionManagementComponent
        ),
    }),
    hookNavigator({
      icon: 'cloud-settings',
      path: 'tenant-option-management',
      label: 'Options',
      parent: 'Settings',
    }),
  ],
})
export class TenantOptionManagementModule {}
