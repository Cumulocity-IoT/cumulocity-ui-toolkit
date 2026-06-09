import { IManagedObject } from '@c8y/client';

export interface SmartViewColumn {
  /** Column identifier — must match a property name on the listed managed objects. */
  name: string;
  /** Dot-notation path to the value inside each managed object. */
  path: string;
  /** Localised header label shown in the data grid. */
  header: string;
}

export interface SmartViewConfiguration {
  /**
   * Raw Cumulocity OData filter string, e.g.
   * `"type eq 'c8y_building' and has(c8y_IsAsset)"`.
   * Stored as a human-readable string; use `QueriesUtil` +
   * `__useFilterQueryString` to convert it back to a QueryObject.
   */
  query: string;
  columns: SmartViewColumn[];
}

/** A managed object that carries a smart-view configuration fragment. */
export interface ISmartViewManagedObject extends IManagedObject {
  c8y_SmartViewConfiguration?: SmartViewConfiguration;
  /** Present (as an empty object `{}`) when the MO is an asset. */
  c8y_IsAsset?: Record<string, never>;
}

export function isSmartViewManagedObject(mo: IManagedObject): mo is ISmartViewManagedObject {
  return 'c8y_SmartViewConfiguration' in mo;
}
