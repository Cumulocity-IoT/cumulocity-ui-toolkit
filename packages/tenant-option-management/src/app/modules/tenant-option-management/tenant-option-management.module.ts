import { hookNavigator, hookRoute, NavigatorNode } from '@c8y/ngx-components';
import { TenantOptionManagementService } from './tenant-option-management.service';

export const TenantOptionManagementProviders = [
  TenantOptionManagementService,
  hookRoute({
    path: 'tenant-option-management',
    loadComponent: () =>
      import('./tenant-option-management.component').then((m) => m.TenantOptionManagementComponent),
  }),
  hookNavigator(
    new NavigatorNode({
      icon: 'cloud-settings',
      path: 'tenant-option-management',
      label: 'Options',
      parent: 'Settings',
    })
  ),
];

/** @deprecated Use TenantOptionManagementProviders instead */
export const TenantOptionManagementModule = TenantOptionManagementProviders;
