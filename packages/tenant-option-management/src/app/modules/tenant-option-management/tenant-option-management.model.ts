import { IManagedObject, ITenantOption } from '@c8y/client';

export const ImportStatusEnum = {
  LOADING: 'LOADING',
  NEW: 'NEW',
  CONFLICT: 'CONFLICT',
  OVERWRITE: 'OVERWRITE',
  UPDATED: 'UPDATED',
  ADDED: 'ADDED',
} as const satisfies Record<string, string>;

export type ImportStatus = (typeof ImportStatusEnum)[keyof typeof ImportStatusEnum];

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

/**
 * Narrows an entry of a user-supplied import file. The file is arbitrary JSON,
 * so `category` and `key` must be verified before they are used to build
 * tenant-option requests.
 */
export function isImportableTenantOption(
  value: unknown
): value is Pick<ITenantOption, 'category' | 'key' | 'value'> {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const { category, key } = value as Partial<ITenantOption>;

  return typeof category === 'string' && !!category && typeof key === 'string' && !!key;
}

export interface TenantOptionConfiguration extends IManagedObject {
  type: 'tenant_option_plugin_config';
  options: TenantOptionConfigurationItem[];
}
