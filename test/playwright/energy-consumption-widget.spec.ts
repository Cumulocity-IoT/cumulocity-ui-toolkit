import { expect, test } from './support/fixtures';
import type { APIRequestContext, Page, Request } from '@playwright/test';
import { DASHBOARD_READY, shell } from './support/dashboard';

/**
 * Energy Consumption Widget e2e — runs against the tenant mock (windy-dev world).
 * Converted from cypress/e2e/energy-consumption-widget.cy.ts. The meter device and its readings are created on
 * the mock per test; each test opens its own dashboard.
 */

const WIDGET_ID = 'energy-comsumption.widget';
const WIDGET = 'c8y-energy-consumption-widget';
/** The widget on the dashboard, not the preview of the config modal (which lingers while the modal closes). */
const DASHBOARD_WIDGET = `c8y-widgets-dashboard ${WIDGET}`;
const CONFIG = 'c8y-energy-consumption-widget-config';
const TYPE = 'e2e_EnergyMeter';
/**
 * "Now" for the seeded data: the page's clock. In a frozen run (`--frozen`) the page's `Date` stands a minute after
 * the world's `now`, so data created from Node's real clock would lie in the page's future.
 */
const NOW = process.env.C8Y_FROZEN_NOW
  ? new Date(process.env.C8Y_FROZEN_NOW).getTime() + 60_000
  : Date.now();

const BASE_CONFIG = {
  rangeType: 'date',
  displayMode: 'delta',
  defaultRange: '7 days',
  exposeRangeSelect: false,
  type: TYPE,
  fragment: 'e2e_EnergyMeter',
  series: 'E',
  digits: 2,
  barColor: '#ff0000',
  beginAtZero: true,
};

interface MO {
  id: string;
  name: string;
}

type VisitApp = (path?: string, options?: object) => Promise<void>;

async function create(api: APIRequestContext, data: Record<string, unknown>): Promise<MO> {
  const res = await api.post('/inventory/managedObjects', { data });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

function createDashboard(
  api: APIRequestContext,
  device: MO,
  config: Record<string, unknown> | null
): Promise<MO> {
  const children: Record<string, unknown> = {};

  if (config) {
    children['ecw1'] = {
      id: 'ecw1',
      componentId: WIDGET_ID,
      name: WIDGET_ID,
      title: 'Energy',
      config,
      _x: 0,
      _y: 0,
      _width: 12,
      _height: 6,
    };
  }

  return create(api, {
    name: 'Energy Dashboard',
    c8y_Dashboard: { name: 'Energy Dashboard', icon: 'th', priority: 10000, children },
    [`c8y_Dashboard!device!${device.id}`]: {},
  });
}

const isMeasurements = (url: string) => url.includes('/measurement/measurements?');

/** Collects the measurement requests the page sends. */
function trackMeasurements(page: Page): Request[] {
  const requests: Request[] = [];

  page.on('request', (req) => {
    if (isMeasurements(req.url())) requests.push(req);
  });

  return requests;
}

test.describe('Energy Consumption Widget', () => {
  // all tests share one meter device, so each test opens its own dashboard directly
  let device: MO;

  async function visitDashboard(visitApp: VisitApp, dashboard: MO, selector: string) {
    await visitApp(`device/${device.id}/dashboard/${dashboard.id}`, {
      language: 'en',
      waitFor: selector,
    });
  }

  async function visitWithConfig(
    api: APIRequestContext,
    visitApp: VisitApp,
    config: Record<string, unknown>
  ) {
    const dashboard = await createDashboard(api, device, {
      ...BASE_CONFIG,
      device: { id: device.id, name: device.name },
      ...config,
    });

    await visitDashboard(visitApp, dashboard, WIDGET);
  }

  test.beforeEach(async ({ mock, api }) => {
    await mock.reset();
    device = await create(api, { name: `Energy Meter ${NOW}`, c8y_IsDevice: {} });

    // a cumulative meter reading per day for the last 10 days
    for (let i = 10; i >= 0; i--) {
      const time = new Date(NOW - i * 24 * 3600 * 1000 - 3600 * 1000).toISOString();
      const res = await api.post('/measurement/measurements', {
        data: {
          source: { id: device.id },
          type: TYPE,
          time,
          e2e_EnergyMeter: { E: { value: 1000 + (10 - i) * 12.345, unit: 'kWh' } },
        },
      });

      expect(res.ok()).toBeTruthy();
    }
  });

  test('is offered in the add-widget dialog with its config form and defaults', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    const dashboard = await createDashboard(api, device, null);

    await visitDashboard(visitApp, dashboard, DASHBOARD_READY);
    await shell(page).dashboard.addWidget('Energy Consumption Widget');

    const form = page.locator(CONFIG);

    await expect(form.locator('select[id*="_rangeType_"] option:checked')).toContainText(
      'By Date Range'
    );
    await expect(form.locator('select[id*="_displayMode_"] option:checked')).toContainText('Total');
    await expect(form.locator('select[id*="_defaultRange_"] option:checked')).toContainText(
      'Last 7 Days'
    );
    await expect(form.locator('input[id*="_digits_"]')).toHaveValue('2');
    await expect(form.locator('input[id*="_exposeRangeSelect_"]')).not.toBeChecked();
    // "Begin Scale at Zero" is only offered in total mode
    await expect(form.locator('input[id*="_beginAtZero_"]')).toBeAttached();
    await form.locator('select[id*="_displayMode_"]').selectOption({ label: '📊 Delta' });
    await expect(form.locator('input[id*="_beginAtZero_"]')).toHaveCount(0);
    // event range type is not offered (not supported yet)
    await expect(form.locator('input[id*="_eventType_"]')).toHaveCount(0);
    await reviewScreenshot('energy-consumption-widget/config');
  });

  test('saves the configuration entered in the config form', async ({ page, api, visitApp }) => {
    const dashboard = await createDashboard(api, device, null);

    await visitDashboard(visitApp, dashboard, DASHBOARD_READY);
    await shell(page).dashboard.addWidget('Energy Consumption Widget');

    const form = page.locator(CONFIG);

    await form.locator('select[id*="_displayMode_"]').selectOption({ label: '📊 Delta' });
    await form.locator('select[id*="_defaultRange_"]').selectOption({ label: 'Last 12 Hours' });
    // styled checkbox: the input has no box, so a real click lands nowhere
    await form.locator('input[id*="_exposeRangeSelect_"]').dispatchEvent('click');
    await expect(form.locator('input[id*="_exposeRangeSelect_"]')).toBeChecked();
    await form.locator('input[id*="_type_"]').fill(TYPE);
    await form.locator('input[id*="_fragment_"]').fill('e2e_EnergyMeter');
    await form.locator('input[id*="_series_"]').fill('E');
    await form.locator('input[id*="_digits_"]').fill('1');
    await form.locator('input[id*="_barColor_"]').fill('#00ff00');

    const saved = page.waitForRequest(
      (req) =>
        req.method() === 'PUT' && req.url().includes(`/inventory/managedObjects/${dashboard.id}`)
    );

    await shell(page).widgetConfig.save();
    await shell(page).dashboard.save();

    const children = (await saved).postDataJSON().c8y_Dashboard.children as Record<
      string,
      { config: Record<string, unknown> }
    >;
    const config = Object.values(children)[0].config;

    expect(config).toMatchObject({
      rangeType: 'date',
      displayMode: 'delta',
      defaultRange: '12 hours',
      exposeRangeSelect: true,
      type: TYPE,
      fragment: 'e2e_EnergyMeter',
      series: 'E',
      digits: 1,
      barColor: '#00ff00',
    });
    expect(config).toHaveProperty('device.id', device.id);
    await expect(page.locator(`${DASHBOARD_WIDGET} canvas`)).toBeVisible();
  });

  // Bar values live in a Chart.js canvas whose instance is not reachable from the page,
  // so the rendering tests assert the queries the chart is built from and the canvas itself.
  test('queries one reading per milestone of the default range and renders the bar chart', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    const measurements = trackMeasurements(page);

    await visitWithConfig(api, visitApp, {});

    // "7 days" → now + 7 day boundaries
    await expect.poll(() => measurements.length).toBeGreaterThanOrEqual(8);

    for (const req of measurements.slice(0, 8)) {
      const query = Object.fromEntries(new URL(req.url()).searchParams);

      expect(query).toMatchObject({ source: device.id, type: TYPE, pageSize: '1', revert: 'true' });
    }
    await expect(page.locator(`${WIDGET} canvas`)).toBeVisible();
    await expect(page.locator(`${WIDGET} c8y-loading`)).toHaveCount(0);
    await expect(page.locator(`${WIDGET} header select`)).toHaveCount(0);
    await reviewScreenshot('energy-consumption-widget/bar-chart');
  });

  test('exposes a range select that reloads the data for the chosen range', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    const measurements = trackMeasurements(page);

    await visitWithConfig(api, visitApp, { exposeRangeSelect: true, displayMode: 'total' });

    const select = page.locator(`${WIDGET} header select`);

    await expect(select).toBeVisible();
    await expect(select.locator('option:checked')).toContainText('Last 7 Days');
    await expect(page.locator(`${WIDGET} canvas`)).toBeVisible();

    await expect.poll(() => measurements.length).toBe(8);
    await reviewScreenshot('energy-consumption-widget/range-select');
    await select.selectOption({ label: 'Last 12 Hours' });
    // 12 hours → now + 12 hour boundaries = 13 more requests
    await expect.poll(() => measurements.length).toBe(8 + 13);
    await expect(page.locator(`${WIDGET} canvas`)).toBeVisible();

    await select.selectOption({ label: 'Last 4 Weeks' });
    await expect.poll(() => measurements.length).toBe(8 + 13 + 5);
  });

  test('shows an error alert when the measurements cannot be loaded', async ({
    page,
    api,
    visitApp,
  }) => {
    await page.route(
      (url) => isMeasurements(url.href),
      (route) => route.fulfill({ status: 500, json: {} })
    );
    const failed = page.waitForResponse((res) => isMeasurements(res.url()) && res.status() === 500);

    await visitWithConfig(api, visitApp, {});

    await failed;
    await expect(shell(page).alerts.messages.and(page.locator('.alert-danger'))).toContainText(
      'Could not load the measurements.'
    );
    await expect(page.locator(`${WIDGET} c8y-loading`)).toHaveCount(0);
  });
});
