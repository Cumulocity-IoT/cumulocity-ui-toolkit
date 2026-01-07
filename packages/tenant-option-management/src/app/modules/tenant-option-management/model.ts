import { IManagedObject, ITenantOption } from '@c8y/client';

export enum ImportStatus {
  LOADING = 'LOADING',
  NEW = 'NEW',
  CONFLICT = 'CONFLICT',
  OVERWRITE = 'OVERWRITE',
  UPDATED = 'UPDATED',
  ADDED = 'ADDED',
}

export type TenantOptionConfigurationItem = Omit<TenantOptionRow, 'value' | 'id' | 'status'>;

export interface TenantOptionRow extends ITenantOption {
  id: string;
  encrypted?: string;
  value: string;
  lastUpdated?: string;
  user?: string;
  status?: ImportStatus;
}

export interface TenantOptionImportRow extends ITenantOption {
  id: string;
  status: ImportStatus;
}

export interface TenantOptionConfiguration extends IManagedObject {
  type: 'tenant_option_plugin_config';
  options: TenantOptionConfigurationItem[];
}
