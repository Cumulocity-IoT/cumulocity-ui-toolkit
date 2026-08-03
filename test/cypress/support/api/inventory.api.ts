import { Client, IManagedObject, IResult } from '@c8y/client';

export interface GroupHierarchy {
  id?: string;
  name: string;
  children?: GroupHierarchy[];
}

const RETRYABLE_STATUS_CODES = new Set([500, 502, 503, 504]);
const MAX_INVENTORY_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

function getStatusCode(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const err = error as {
    status?: number;
    response?: { status?: number };
    data?: { status?: number };
  };
  return err.status ?? err.response?.status ?? err.data?.status;
}

function withInventoryRetry<T>(
  operationName: string,
  operation: () => Promise<T>,
  attempt = 1
): Promise<T> {
  return operation().catch((error: unknown) => {
    const statusCode = getStatusCode(error);
    const shouldRetry =
      typeof statusCode === 'number' &&
      RETRYABLE_STATUS_CODES.has(statusCode) &&
      attempt < MAX_INVENTORY_RETRIES;

    if (!shouldRetry) {
      throw error;
    }

    Cypress.log({
      name: operationName,
      message: `retry ${attempt}/${MAX_INVENTORY_RETRIES - 1} after ${statusCode}`,
    });

    return Cypress.Promise.delay(RETRY_DELAY_MS * attempt).then(() =>
      withInventoryRetry(operationName, operation, attempt + 1)
    );
  });
}

// ---------------------------------------------------------------------------
// CRUD helpers (all return Cypress chainables)
// ---------------------------------------------------------------------------

/**
 * Creates a device-group managed object via the C8Y inventory API.
 * Adds `c8y_IsDeviceGroup`, `c8y_CypressTestGroup` and `type` automatically.
 * Any extra fields from `groupOptions` are merged in.
 */
export function createGroup(client: Client, groupOptions: Record<string, unknown>) {
  const data = {
    ...groupOptions,
    c8y_IsDeviceGroup: {},
    c8y_CypressTestGroup: {},
    type: 'c8y_DeviceGroup',
  };

  Cypress.log({
    name: 'createGroup',
    message: String(groupOptions.name ?? ''),
    consoleProps: () => ({ groupOptions }),
  });

  return withInventoryRetry('createGroup', () => client.inventory.create(data)).then((res) => {
    expect(res.data.id).to.not.be.undefined;
    return res;
  });
}

/**
 * Creates a device managed object via the C8Y inventory API.
 * Adds `c8y_IsDevice` and `c8y_CypressTestDevice` automatically.
 */
export function createDevice(client: Client, deviceOptions: Record<string, unknown>) {
  const data = {
    ...deviceOptions,
    c8y_IsDevice: {},
    c8y_CypressTestDevice: {},
  };

  Cypress.log({
    name: 'createDevice',
    message: String(deviceOptions.name ?? ''),
    consoleProps: () => ({ deviceOptions }),
  });

  return withInventoryRetry('createDevice', () => client.inventory.create(data)).then((res) => {
    expect(res.data.id).to.not.be.undefined;
    return res;
  });
}

/**
 * Assigns `assetId` as a child asset of `groupId`.
 */
export function assignToGroup(client: Client, groupId: string, assetId: string) {
  Cypress.log({
    name: 'assignToGroup',
    message: `${groupId} ← ${assetId}`,
    consoleProps: () => ({ groupId, assetId }),
  });

  return withInventoryRetry('assignToGroup', () =>
    client.inventory.childAssetsAdd(assetId, groupId)
  ).then((res) => {
    expect(res.data.id).to.not.be.undefined;
    return res;
  });
}

/**
 * Assigns `childId` as a child device of `deviceId`.
 */
export function assignAsChildDevice(client: Client, deviceId: string, childId: string) {
  Cypress.log({
    name: 'assignAsChildDevice',
    message: `${deviceId} ← ${childId}`,
    consoleProps: () => ({ deviceId, childId }),
  });

  return withInventoryRetry('assignAsChildDevice', () =>
    client.inventory.childDevicesAdd(childId, deviceId)
  ).then((res) => {
    expect(res.data.id).to.not.be.undefined;
    return res;
  });
}

// ---------------------------------------------------------------------------
// Hierarchy builder
// ---------------------------------------------------------------------------

/**
 * Recursively creates a group hierarchy and populates the `id` field of each
 * node in `hierarchy` so callers can reference created ids without separate
 * assertions.
 */
export function createGroupHierarchy(
  hierarchy: GroupHierarchy,
  cy_testId: string,
  parentResponse?: IResult<IManagedObject>
): Cypress.Chainable {
  // Capture the raw IResult via closure so we can pass it to children without
  // having to unwrap the Cypress-response wrapper that c8yclient yields.
  let capturedResponse: IResult<IManagedObject>;

  return cy
    .c8yclient((c) =>
      createGroup(c, { name: hierarchy.name, cy_testId }).then((groupResponse) => {
        // Capture and set id inside the native Promise — same as the original
        // code, so downstream callers that read hierarchy.id synchronously
        // within the same native-promise chain still work.
        capturedResponse = groupResponse;
        hierarchy.id = groupResponse.data.id;
        if (parentResponse) {
          return assignToGroup(c, parentResponse.data.id, groupResponse.data.id).then(
            () => groupResponse
          );
        }
        return groupResponse;
      })
    )
    .then(() => {
      if (!hierarchy.children?.length) {
        return;
      }
      // Chain child creation via Cypress .then() — NOT inside a native Promise
      // callback.  Commands enqueued from a Cypress .then() are inserted directly
      // after the current command, so all children are fully created (and their
      // ids populated) before any subsequent top-level cy commands run.
      return hierarchy.children.reduce(
        (chain: Cypress.Chainable, child) =>
          chain.then(() => createGroupHierarchy(child, cy_testId, capturedResponse)),
        cy.wrap(null)
      );
    });
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Deletes all managed objects tagged with `cy_testId` from the inventory.
 * Safe to call in `before`/`after` hooks — failures are logged, not thrown.
 */
export function clearAllManagedObjectsOfTest(cy_testId: string): void {
  cy.c8yclient((c) =>
    c.inventory.list({ pageSize: 2000, query: `cy_testId eq '${cy_testId}'` })
  ).c8yclient(
    (c, res) => {
      cy.log(
        `Clearing ${res.body.managedObjects.length} managed objects with cy_testId "${cy_testId}"`
      );
      return res.body.managedObjects.map((mo: { id: string; name: string }) =>
        c.inventory
          .delete(mo.id, { cascade: true })
          .catch((err) => cy.log(`Warning: could not delete ${mo.name} (${mo.id})`, err))
      );
    },
    { failOnStatusCode: false }
  );
}
