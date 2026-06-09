import { IManagedObject } from '@c8y/client';

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
}

/**
 * Represents a complete Smart View configuration
 */
export interface SmartViewConfiguration extends IManagedObject {
  name: string;
  type: string;
  c8y_SmartViewConfiguration: SmartViewConfigurationData;
}
