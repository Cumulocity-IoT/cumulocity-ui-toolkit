// Unavailable devices on the tenant mock. Like a tenant, the mock derives `c8y_Availability` from a device's last
// message and `c8y_RequiredAvailability`: a PUT of `c8y_Availability` does not stick. So the world is loaded again
// with the devices' last message hours back; `restoreWorld()` (in `afterEach`) loads the original world again.

type WorldFile = { now: string; managedObjects: Array<Record<string, unknown> & { id: string }> };

let original: WorldFile | undefined;

export function makeUnavailable(...ids: string[]): void {
  cy.request<WorldFile>('/_mock/world').then(({ body }) => {
    original ??= body;
    const lastMessage = new Date(Date.parse(body.now) - 6 * 3_600_000).toISOString();
    const world: WorldFile = {
      ...body,
      managedObjects: body.managedObjects.map((mo) =>
        ids.includes(mo.id)
          ? {
              ...mo,
              c8y_RequiredAvailability: mo.c8y_RequiredAvailability ?? { responseInterval: 60 },
              c8y_Availability: { status: 'UNAVAILABLE', lastMessage },
            }
          : mo
      ),
    };
    cy.loadWorld(world);
  });
}

export function restoreWorld(): void {
  if (!original) return;
  cy.loadWorld(original);
  original = undefined;
}
