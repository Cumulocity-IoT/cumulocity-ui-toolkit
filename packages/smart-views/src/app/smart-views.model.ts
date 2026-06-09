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
}
