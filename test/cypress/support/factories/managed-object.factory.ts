import { IManagedObject } from '@c8y/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * Returns a fully-formed IManagedObject skeleton with all required relationship
 * arrays populated and a random id/name. Use the `parts` argument to override
 * any field before returning.
 */
export function createManagedObject(parts?: Partial<IManagedObject>): IManagedObject {
  const base: IManagedObject = {
    additionParents: { references: [], self: '' },
    owner: 'Cypress createManagedObject',
    childDevices: { references: [], self: '' },
    childAssets: { references: [], self: '' },
    creationTime: new Date().toISOString(),
    type: 'c8y_CypressType',
    lastUpdated: new Date().toISOString(),
    childAdditions: { references: [], self: '' },
    name: 'Cypress Test Group',
    deviceParents: { references: [], self: '' },
    c8y_CypressType: {},
    assetParents: { references: [], self: '' },
    self: '',
    id: mockId(),
  };
  return parts ? { ...base, ...parts } : base;
}

/**
 * Creates a mock device managed object (`c8y_IsDevice` fragment included).
 */
export function mockDevice(parts?: Partial<IManagedObject>): IManagedObject {
  return { ...createManagedObject(parts), c8y_IsDevice: {} };
}

/**
 * Creates a mock device group managed object (`c8y_IsDeviceGroup` fragment included).
 */
export function mockGroup(parts?: Partial<IManagedObject>): IManagedObject {
  return { ...createManagedObject(parts), c8y_IsDeviceGroup: {} };
}

/**
 * Deep-clones a managed object and stamps it with a fresh unique id/name/owner
 * so it can be used as an independent sibling in the same test.
 */
export function dynamicClone(mo: IManagedObject): IManagedObject {
  const clone = Cypress._.cloneDeep(mo);
  const shortUnique = Date.now().toString(36);
  clone.name += shortUnique;
  clone.id = mockId();
  clone.owner = 'Cypress dynamicClone';
  return clone;
}

/** Returns a random 16-digit numeric string suitable for use as a managed-object id. */
export function mockId(): string {
  return `${Math.floor(Math.random() * 1e16)}`;
}

/**
 * Wraps `value` in the shape returned by `GET /tenant/options/<category>/<key>`.
 * When `value` is an object it is JSON-serialised.
 */
export function mockTenantOptionResponse(value: string | object): {
  category: string;
  key: string;
  self: string;
  value: string;
} {
  return {
    category: '',
    key: '',
    self: '',
    value: typeof value === 'string' ? value : JSON.stringify(value),
  };
}
