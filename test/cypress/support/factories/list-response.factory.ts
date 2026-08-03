import { IEvent, IManagedObject, IMeasurement } from '@c8y/client';

export interface ListStatistics {
  totalPages: number;
  pageSize: number;
  currentPage: number;
}

const DEFAULT_STATISTICS: ListStatistics = {
  totalPages: 1,
  pageSize: 2000,
  currentPage: 1,
};

/**
 * Wraps an array of C8Y domain objects in the standard paged-list response
 * envelope (`managedObjects`, `events`, or `measurements` depending on type).
 */
export function mockListResponse<T extends IManagedObject | IEvent | IMeasurement>(
  data: T[],
  statistics?: Partial<ListStatistics>
): object {
  const stats: ListStatistics = { ...DEFAULT_STATISTICS, ...statistics };
  let body: object = { self: '', statistics: stats };

  if (data.length === 0 || isManagedObject(data[0])) {
    body = { managedObjects: data, ...body };
  } else if (isEvent(data[0])) {
    body = { events: data, ...body };
  } else if (isMeasurement(data[0])) {
    body = { measurements: data, ...body };
  }

  return body;
}

/**
 * Wraps an array of managed objects in the child-assets reference envelope
 * returned by `GET inventory/managedObjects/{id}/childAssets`.
 */
export function mockChildAssetsResponse(
  data: IManagedObject[],
  statistics?: Partial<ListStatistics>
): object {
  return {
    next: '',
    self: '',
    references: data.map((mo) => ({ managedObject: mo, self: '' })),
    statistics: { ...DEFAULT_STATISTICS, ...statistics },
  };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isManagedObject(obj: unknown): obj is IManagedObject {
  const required = [
    'additionParents',
    'owner',
    'childAssets',
    'childDevices',
    'lastUpdated',
    'deviceParents',
    'assetParents',
  ];
  return required.every((attr) => Cypress._.has(obj, attr));
}

function isEvent(obj: unknown): obj is IEvent {
  return ['source', 'type', 'time', 'text'].every((attr) => Cypress._.has(obj, attr));
}

function isMeasurement(obj: unknown): obj is IMeasurement {
  for (const key of Object.keys(obj as object)) {
    const fragment = Cypress._.get(obj, key);
    if (fragment && typeof fragment === 'object') {
      for (const nestedKey of Object.keys(fragment)) {
        if (
          Cypress._.has(fragment, `${nestedKey}.value`) &&
          Cypress._.has(fragment, `${nestedKey}.unit`)
        ) {
          return true;
        }
      }
    }
  }
  return false;
}
