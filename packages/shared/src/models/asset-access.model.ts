export type AssetFilterMethod = 'custom-endpoint' | 'managed-object' | 'inventory-query';

export interface AssetFilterConfig {
  method: AssetFilterMethod;
  endpoint?: string;
  managedObjectId?: string;
  fragment?: string;
  query?: string;
  cacheTtl?: number;
}
