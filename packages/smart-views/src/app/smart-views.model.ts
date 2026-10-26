import { IManagedObject } from '@c8y/client';

/** Managed-object type identifying a smart view configuration. */
export const SMART_VIEW_CONFIGURATION_TYPE = 'c8y_SmartViewConfiguration';

/** Managed-object type identifying an asset definition (asset type). */
export const ASSET_DEFINITION_TYPE = 'c8y_AssetDefinition';

/**
 * Represents a column configuration in a Smart View
 */
export interface SmartViewColumn {
  name: string;
  path: string;
  header: string;
}

/**
 * Represents the Smart View configuration data
 */
export interface SmartViewConfigurationData {
  icon: string;
  query: string;
  columns: SmartViewColumn[];
  /** Id of the asset definition this view is based on. */
  assetDefinitionId?: string;
  /** Name of the asset definition this view is based on (kept for display). */
  assetDefinitionName?: string;
  /** Priority used to order the view's entry in the navigator menu. */
  priority?: number;
}

/**
 * Represents a complete Smart View configuration
 */
export interface SmartViewConfiguration extends IManagedObject {
  name: string;
  type: string;
  c8y_SmartViewConfiguration: SmartViewConfigurationData;
}

/**
 * Icon configured on an asset definition.
 */
export interface AssetDefinitionIcon {
  name: string;
  category?: string;
}

/**
 * An asset definition managed object (type `c8y_AssetDefinition`) that can be
 * used as the data source for a smart view.
 */
export interface AssetDefinition extends IManagedObject {
  name: string;
  icon?: AssetDefinitionIcon;
}

/**
 * Form model used while creating a new smart view configuration in the modal.
 */
export interface SmartViewConfigurationDraft {
  name: string;
  icon: string;
  assetDefinitionId: string;
  assetDefinitionName: string;
  columns: SmartViewColumn[];
  priority: number;
}

/** Type guard: true when the managed object carries a smart view configuration fragment. */
export function isSmartViewConfiguration(mo: IManagedObject): mo is SmartViewConfiguration {
  return !!mo && typeof mo['c8y_SmartViewConfiguration'] === 'object';
}

/**
 * Prepares a raw filter expression for `QueriesUtil`'s `__useFilterQueryString`
 * operator, which only keeps what is inside the outermost parentheses. A bare
 * expression such as `type eq 'x'` would otherwise be dropped entirely, and one
 * like `(a) and has(b)` would be cut to `a) and has(b`. Full `$filter=(…)`
 * strings are passed through unchanged.
 */
export function toFilterQueryString(rawQuery: string): string {
  const trimmed = (rawQuery ?? '').trim();

  return trimmed.startsWith('$filter=') ? trimmed : `(${trimmed})`;
}
