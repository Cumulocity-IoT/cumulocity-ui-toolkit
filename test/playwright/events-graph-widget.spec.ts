import { expect, test } from './support/fixtures';
import type { APIRequestContext, Page, Request } from '@playwright/test';
import { DASHBOARD_READY, shell } from './support/dashboard';

/**
 * Events Graph widget e2e — runs against the tenant mock (windy-dev world) inside the cockpit shell.
 * Converted from cypress/e2e/events-graph-widget.cy.ts. Devices, events and dashboards are created on the mock
 * once per file (the mock is reset once, in beforeAll); the error path is stubbed in the browser with page.route.
 */

const WIDGET_ID = 'events-graph.widget';
const WIDGET = 'c8y-events-graph';
const CONFIG = 'c8y-event-status';
const TYPE = 'e2e_MachineState';
const cy_ = (name: string) => `[data-cy="events-graph${name}"]`;
/**
 * "Now" for the seeded data: the page's clock. In a frozen run (`--frozen`) the page's `Date` stands a minute after
 * the world's `now`, so data created from Node's real clock would lie in the page's future.
 */
const NOW = process.env.C8Y_FROZEN_NOW
  ? new Date(process.env.C8Y_FROZEN_NOW).getTime() + 60_000
  : Date.now();

interface MO {
  id: string;
  name: string;
}

const BASE_CONFIG = {
  hours: 4,
  realtime: false,
  realtimeInterval: 30000,
  scale: 0.2,
  types: [
    {
      type: TYPE,
      values: [
        { name: 'RUNNING', label: 'Running', color: '#00aa00' },
        { name: 'STOPPED', label: 'Stopped', color: '#aa0000' },
      ],
    },
  ],
};

const path = (r: Request) => new URL(r.url()).pathname;
const isEventsQuery = (r: Request) => r.method() === 'GET' && path(r).endsWith('/event/events');
const query = (r: Request) => Object.fromEntries(new URL(r.url()).searchParams.entries());

async function createDevice(api: APIRequestContext, name: string): Promise<MO> {
  const res = await api.post('/inventory/managedObjects', { data: { name, c8y_IsDevice: {} } });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

async function createEvent(
  api: APIRequestContext,
  source: MO,
  type: string,
  text: string,
  time: string
) {
  const res = await api.post('/event/events', {
    data: { source: { id: source.id }, type, text, time },
  });

  expect(res.ok()).toBeTruthy();
}

async function createDashboard(
  api: APIRequestContext,
  device: MO,
  config: Record<string, unknown> | null,
  context: 'device' | 'group' = 'device'
): Promise<MO> {
  const children: Record<string, unknown> = {};

  if (config) {
    children['egw1'] = {
      id: 'egw1',
      componentId: WIDGET_ID,
      name: WIDGET_ID,
      title: 'Machine states',
      config,
      _x: 0,
      _y: 0,
      _width: 12,
      _height: 6,
    };
  }
  const res = await api.post('/inventory/managedObjects', {
    data: {
      name: 'Events Graph Dashboard',
      c8y_Dashboard: { name: 'Events Graph Dashboard', icon: 'th', priority: 10000, children },
      [`c8y_Dashboard!${context}!${device.id}`]: {},
    },
  });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

const chart = (page: Page) => page.locator(`${WIDGET} ${cy_('--chart')} canvas`);

/** Move the pointer to `fraction` of the plot width; returns the time cursor's first state readout. */
async function stateAt(page: Page, fraction: number): Promise<string> {
  const canvas = chart(page);

  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;

  await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
  await page.mouse.move(box.x + box.width * fraction + 1, box.y + box.height / 2);

  return (
    (
      await page
        .locator(`${WIDGET} ${cy_('--cursor-state')}`)
        .first()
        .textContent()
    )?.trim() ?? ''
  );
}

test.describe('Events Graph Widget', () => {
  let device: MO;
  const eventRequests: Request[] = [];

  test.beforeAll(async ({ mock, api }) => {
    await mock.reset();
    device = await createDevice(api, `Machine ${NOW}`);
    // one state before the 4 h window (picked up as the initial state) and alternating states every 30 minutes inside it
    const states = ['STOPPED', 'RUNNING', 'STOPPED', 'RUNNING', 'STOPPED', 'RUNNING', 'STOPPED'];

    for (const [i, text] of states.entries()) {
      const time = new Date(NOW - (5 - i * 0.5) * 3600 * 1000).toISOString();

      await createEvent(api, device, TYPE, text, time);
    }
  });

  test.beforeEach(({ page }) => {
    eventRequests.length = 0;
    page.on('request', (r) => {
      if (isEventsQuery(r)) eventRequests.push(r);
    });
  });

  async function visitDashboard(page: Page, visitApp: VisitApp, dashboard: MO, selector: string) {
    await visitApp(`device/${device.id}/dashboard/${dashboard.id}`, {
      language: 'en',
      waitFor: selector,
      timeout: 60_000,
    });
  }

  async function visitWithConfig(
    page: Page,
    api: APIRequestContext,
    visitApp: VisitApp,
    config: Record<string, unknown>,
    selector = WIDGET
  ) {
    const dashboard = await createDashboard(api, device, {
      ...BASE_CONFIG,
      device: { id: device.id, name: device.name },
      ...config,
    });

    await visitDashboard(page, visitApp, dashboard, selector);
  }

  test('is offered in the add-widget dialog and saves the configured event types', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    const dashboard = await createDashboard(api, device, null);

    await visitDashboard(page, visitApp, dashboard, DASHBOARD_READY);
    await shell(page).dashboard.addWidget('Events Graph');

    const config = page.locator(CONFIG);

    await expect(config).toBeVisible();
    await expect(config.locator(cy_('-config--type'))).toHaveCount(0);
    await expect(config.locator(cy_('-config--refresh-interval'))).toHaveValue('30');
    await expect(config.locator(cy_('-config--refresh-interval'))).toBeDisabled();

    await config.locator(cy_('-config--hours')).fill('6');
    await config.locator(cy_('-config--realtime')).check({ force: true });
    await expect(config.locator(cy_('-config--refresh-interval'))).toBeEnabled();
    await config.locator(cy_('-config--refresh-interval')).fill('10');

    // first type with two values
    await config.locator(cy_('-config--add-type')).click();
    await expect(config.locator(cy_('-config--type'))).toHaveCount(1);
    await expect(config.locator(cy_('-config--remove-type'))).toHaveCount(0);
    await config.locator(cy_('-config--type-input')).fill(TYPE);
    await config.locator(cy_('-config--value-name')).fill('RUNNING');
    await config.locator(cy_('-config--value-label')).fill('Running');
    await config.locator(cy_('-config--value-color')).fill('#00aa00');
    await expect(config.locator(cy_('-config--remove-value'))).toHaveCount(0);
    await config.locator(cy_('-config--add-value')).click();
    await expect(config.locator(cy_('-config--value-name'))).toHaveCount(2);
    await config.locator(cy_('-config--value-name')).last().fill('STOPPED');

    // a second type that is removed again, and a value that is removed again
    await config.locator(cy_('-config--add-type')).click();
    await expect(config.locator(cy_('-config--type'))).toHaveCount(2);
    await config.locator(cy_('-config--remove-type')).last().click();
    await expect(config.locator(cy_('-config--type'))).toHaveCount(1);
    await config.locator(cy_('-config--add-value')).click();
    await expect(config.locator(cy_('-config--value-name'))).toHaveCount(3);
    await config.locator(cy_('-config--remove-value')).last().click();
    await expect(config.locator(cy_('-config--value-name'))).toHaveCount(2);

    await reviewScreenshot('events-graph-widget/config');
    const saved = page.waitForRequest(
      (r) => r.method() === 'PUT' && path(r).endsWith(`/inventory/managedObjects/${dashboard.id}`)
    );

    await shell(page).widgetConfig.save();
    await shell(page).dashboard.save();

    const children = (await saved).postDataJSON().c8y_Dashboard.children as Record<
      string,
      { config: Record<string, unknown> }
    >;
    const widgetConfig = Object.values(children)[0].config;

    expect(widgetConfig).toMatchObject({
      hours: 6,
      realtime: true,
      realtimeInterval: 10000,
      device: { id: device.id },
    });
    const types = widgetConfig.types as {
      type: string;
      values: { name: string; label: string; color: string }[];
    }[];

    expect(types).toEqual([
      {
        type: TYPE,
        values: [
          { name: 'RUNNING', label: 'Running', color: '#00aa00' },
          { name: 'STOPPED', label: '', color: types[0].values[1].color },
        ],
      },
    ]);
    await expect(chart(page)).toBeVisible();
  });

  test('queries the events of each configured type and renders the timeline', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    await visitWithConfig(page, api, visitApp, {});

    // in parallel: the time box newest first, page by page, and the state active at its start
    await expect.poll(() => eventRequests.length).toBeGreaterThanOrEqual(2);
    const queries = eventRequests.map(query);
    const inBox = queries.find((q) => q.pageSize === '2000');
    const before = queries.find((q) => q.pageSize === '1');

    expect(inBox).toMatchObject({ source: device.id, type: TYPE, currentPage: '1' });
    expect(inBox).not.toHaveProperty('revert');
    expect(before).toMatchObject({ source: device.id, type: TYPE });
    expect(before).toHaveProperty('dateTo');
    expect(before).not.toHaveProperty('dateFrom');

    await expect(chart(page)).toBeVisible();
    await expect(page.locator(`${WIDGET} ${cy_('--reload-button')}`)).toHaveCount(0);
    await reviewScreenshot('events-graph-widget/timeline');
  });

  test('queries one request pair per event type', async ({ page, api, visitApp }) => {
    await visitWithConfig(page, api, visitApp, {
      types: [
        ...BASE_CONFIG.types,
        { type: 'e2e_Other', values: [{ name: 'X', label: '', color: '#000000' }] },
      ],
    });

    await expect(chart(page)).toBeVisible();
    // the earlier state is looked up for every type, with or without events in the time box
    await expect.poll(() => eventRequests.length).toBe(4);
    expect(eventRequests.map((r) => query(r).type)).toContain('e2e_Other');
  });

  test('reloads the events with the auto refresh reload button', async ({
    page,
    api,
    visitApp,
  }) => {
    await visitWithConfig(page, api, visitApp, { realtime: true, realtimeInterval: 600000 });

    await expect(chart(page)).toBeVisible();
    await expect.poll(() => eventRequests.length).toBe(2);
    await expect(page.locator(`${WIDGET} c8y-countdown-interval`)).toBeAttached();
    await page.locator(`${WIDGET} ${cy_('--reload-button')}`).click();
    await expect.poll(() => eventRequests.length).toBe(4);
  });

  test('shows an empty state when no event type is configured', async ({ page, api, visitApp }) => {
    await visitWithConfig(page, api, visitApp, { types: [] });

    await expect(page.locator(`${WIDGET} ${cy_('--no-types')}`)).toContainText(
      'No event types configured'
    );
    await expect(page.locator(`${WIDGET} ${cy_('--chart')}`)).toHaveCount(0);
    expect(eventRequests).toHaveLength(0);
  });

  test('shows an empty state when no device is selected', async ({ page, api, visitApp }) => {
    const dashboard = await createDashboard(api, device, BASE_CONFIG);

    await visitDashboard(page, visitApp, dashboard, WIDGET);

    await expect(page.locator(`${WIDGET} ${cy_('--no-device')}`)).toContainText(
      'No device selected'
    );
  });

  test('shows an error state when the events cannot be loaded', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    await page.route(
      (url) => url.pathname.endsWith('/event/events'),
      (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ status: 500, json: {} })
          : route.fallback()
    );
    await visitWithConfig(page, api, visitApp, {});

    await expect(page.locator(`${WIDGET} ${cy_('--error')}`)).toContainText(
      'Could not load events'
    );
    await expect(page.locator(`${WIDGET} ${cy_('--chart')}`)).toHaveCount(0);
    await reviewScreenshot('events-graph-widget/error');
  });

  test.describe('correlating lanes', () => {
    const GRID_TYPE = 'e2e_GridState';
    const GRID_CONFIG = {
      type: GRID_TYPE,
      values: [{ name: 'CURTAILED', label: 'Curtailed', color: '#0000aa' }],
    };
    let group: MO;
    let pump: MO;

    test.beforeAll(async ({ api }) => {
      const threeHoursAgo = new Date(NOW - 3 * 3600 * 1000).toISOString();

      // a second lane type on the machine, active from 3 h ago on (the cursor hovers ~2 h ago)
      await createEvent(api, device, GRID_TYPE, 'CURTAILED', threeHoursAgo);
      // a group with the machine and a second device, which has its own state events
      pump = await createDevice(api, `Pump ${NOW}`);
      await createEvent(api, pump, TYPE, 'RUNNING', threeHoursAgo);
      const res = await api.post('/inventory/managedObjects', {
        data: { name: `Line ${NOW}`, type: 'c8y_DeviceGroup', c8y_IsDeviceGroup: {} },
      });

      group = (await res.json()) as MO;

      for (const child of [device, pump]) {
        const added = await api.post(`/inventory/managedObjects/${group.id}/childAssets`, {
          data: { managedObject: { id: child.id } },
        });

        expect(added.ok()).toBeTruthy();
      }
    });

    async function visitGroupDashboard(
      visitApp: VisitApp,
      api: APIRequestContext,
      config: Record<string, unknown>,
      selector = WIDGET
    ) {
      const dashboard = await createDashboard(
        api,
        group,
        { ...BASE_CONFIG, device: { id: group.id, name: group.name }, ...config },
        'group'
      );

      await visitApp(`group/${group.id}/dashboard/${dashboard.id}`, {
        language: 'en',
        waitFor: selector,
        timeout: 60_000,
      });
    }

    test('shows the state of every lane at the time cursor', async ({
      page,
      api,
      visitApp,
      reviewScreenshot,
    }) => {
      await visitWithConfig(page, api, visitApp, { types: [...BASE_CONFIG.types, GRID_CONFIG] });

      const cursor = page.locator(`${WIDGET} ${cy_('--cursor')}`);

      await expect(cursor).toContainText('Hover the chart');
      await stateAt(page, 0.5);

      await expect(page.locator(`${WIDGET} ${cy_('--cursor-time')}`)).toHaveText(
        /^\d{2}:\d{2}:\d{2}$/
      );
      const lanes = page.locator(`${WIDGET} ${cy_('--cursor-lane')}`);

      await expect(lanes).toHaveCount(2);
      await expect(lanes.first()).toContainText(TYPE);
      await expect(page.locator(`${WIDGET} ${cy_('--cursor-state')}`).first()).toHaveText(
        /^(Running|Stopped)$/
      );
      await expect(lanes.last()).toContainText('Curtailed');
      await reviewScreenshot('events-graph-widget/time-cursor');

      await chart(page).dispatchEvent('mouseout');
      await expect(cursor).toContainText('Hover the chart');
    });

    test('offers no device per lane on a device dashboard', async ({ page, api, visitApp }) => {
      const dashboard = await createDashboard(api, device, {
        ...BASE_CONFIG,
        device: { id: device.id, name: device.name },
      });

      await visitDashboard(page, visitApp, dashboard, WIDGET);
      await shell(page).dashboard.editWidget(0);

      const config = page.locator(CONFIG);

      await expect(config.locator(cy_('-config--type'))).toHaveCount(1);
      await expect(config.locator(cy_('-config--type-device'))).toHaveCount(0);
    });

    test('lets a lane of a group dashboard take its events from a device of the group', async ({
      page,
      api,
      visitApp,
    }) => {
      await visitGroupDashboard(visitApp, api, {});
      await shell(page).dashboard.editWidget(0);

      const select = page.locator(CONFIG).locator(cy_('-config--type-device'));

      await expect(select.locator('option:checked')).toHaveText('The group itself');
      await expect(select.locator('option')).toHaveCount(3);
      const labels = (await select.locator('option').allTextContents()).map((l) => l.trim());

      expect(labels).toEqual(expect.arrayContaining(['The group itself', device.name, pump.name]));
      await select.selectOption({ label: pump.name });

      const saved = page.waitForRequest(
        (r) => r.method() === 'PUT' && /\/inventory\/managedObjects\/[^/]+$/.test(path(r))
      );

      await shell(page).widgetConfig.save();
      await shell(page).dashboard.save();

      const children = (await saved).postDataJSON().c8y_Dashboard.children as Record<
        string,
        { config: { types: { device?: unknown }[] } }
      >;

      expect(Object.values(children)[0].config.types[0].device).toEqual({
        id: pump.id,
        name: pump.name,
      });
    });

    test('queries each lane from its own device and labels the lanes with it', async ({
      page,
      api,
      visitApp,
    }) => {
      await visitGroupDashboard(visitApp, api, {
        types: [
          { ...BASE_CONFIG.types[0], device: { id: device.id, name: device.name } },
          { ...BASE_CONFIG.types[0], device: { id: pump.id, name: pump.name } },
        ],
      });

      await expect(chart(page)).toBeVisible();
      await expect.poll(() => eventRequests.length).toBeGreaterThanOrEqual(4);
      const sources = eventRequests.map((r) => query(r).source);

      expect(sources).toEqual(expect.arrayContaining([device.id, pump.id]));
      expect(sources).not.toContain(group.id);

      await stateAt(page, 0.5);
      const lanes = page.locator(`${WIDGET} ${cy_('--cursor-lane')}`);

      await expect(lanes).toHaveCount(2);
      await expect(lanes.first()).toContainText(device.name);
      await expect(lanes.last()).toContainText(pump.name);
    });
  });

  test.describe('placing the states on the time axis', () => {
    async function visitDevice(api: APIRequestContext, visitApp: VisitApp, source: MO) {
      const dashboard = await createDashboard(api, source, {
        ...BASE_CONFIG,
        device: { id: source.id, name: source.name },
      });

      await visitApp(`device/${source.id}/dashboard/${dashboard.id}`, {
        language: 'en',
        waitFor: WIDGET,
        timeout: 60_000,
      });
    }

    async function deviceWithEvent(
      api: APIRequestContext,
      name: string,
      hoursAgo: number,
      text: string
    ): Promise<MO> {
      const created = await createDevice(api, `${name} ${NOW}`);

      await createEvent(
        api,
        created,
        TYPE,
        text,
        new Date(NOW - hoursAgo * 3600 * 1000).toISOString()
      );

      return created;
    }

    test('starts a bar at its event time, not at the start of the time box', async ({
      page,
      api,
      visitApp,
    }) => {
      // the only event: 2 h into the 4 h window, nothing before it
      const late = await deviceWithEvent(api, 'Late start', 2, 'RUNNING');

      await visitDevice(api, visitApp, late);

      await expect.poll(() => stateAt(page, 0.15)).toBe('–');
      await expect.poll(() => stateAt(page, 0.9)).toBe('Running');
    });

    test('shows the state a device has been in since before the time box', async ({
      page,
      api,
      visitApp,
    }) => {
      // changed 5 h ago — before the 4 h window — and nothing since
      const stopped = await deviceWithEvent(api, 'Long stop', 5, 'STOPPED');

      await visitDevice(api, visitApp, stopped);

      await expect.poll(() => stateAt(page, 0.5)).toBe('Stopped');
    });
  });
});

type VisitApp = (
  path?: string,
  options?: { language?: string; waitFor?: string; timeout?: number }
) => Promise<void>;
