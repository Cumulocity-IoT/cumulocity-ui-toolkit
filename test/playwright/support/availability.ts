// Unavailable devices on the tenant mock. Like a tenant, the mock derives `c8y_Availability` from a device's last
// message and `c8y_RequiredAvailability`: a PUT of `c8y_Availability` does not stick. So the world is loaded again
// with the devices' last message hours back; `restoreWorld()` (in `afterEach`) loads the original world again.
import type { APIRequestContext } from '@playwright/test';
import type { Mock } from '@cumulocity-iot/ui-sdk/playwright';

type WorldFile = { now: string; managedObjects: Array<Record<string, unknown> & { id: string }> };

let original: WorldFile | undefined;

export async function makeUnavailable(
  api: APIRequestContext,
  mock: Mock,
  ...ids: string[]
): Promise<void> {
  const body = (await (await api.get('/_mock/world')).json()) as WorldFile;

  original ??= body;
  const lastMessage = new Date(Date.parse(body.now) - 6 * 3_600_000).toISOString();

  await mock.loadWorld({
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
  });
}

export async function restoreWorld(mock: Mock): Promise<void> {
  if (!original) return;
  await mock.loadWorld(original);
  original = undefined;
}
