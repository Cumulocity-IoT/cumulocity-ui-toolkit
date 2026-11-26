import { expect, test } from './support/fixtures';
import type { APIRequestContext } from '@playwright/test';
import { shell } from './support/dashboard';

/**
 * KPI Trend Widget e2e — runs against the tenant mock (windy-dev world).
 * Converted from cypress/e2e/kpi-trend-widget.cy.ts. The device with its measurement history is created on the
 * mock once; each test opens its own dashboard.
 */

const WIDGET_ID = 'windy.kpi-trend';
const WIDGET = 'ps-kpi-trend-widget';
/** The widget's own hooks: `data-cy="kpi-trend--<name>"`; state is exposed as `data-variant`, `data-state`, `data-trend`. */
const cy = (name: string) => `[data-cy="kpi-trend--${name}"]`;
const FRAGMENT = 'e2e_Temperature';
const SERIES = 'T';
const UNIT = '°C';
/** The newest of the seeded measurements, so the value the widget shows. */
const CURRENT = 72;
/** One measurement every 5 minutes over the last hour, rising towards CURRENT. */
const HISTORY = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, CURRENT];
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

type VisitApp = (path?: string, options?: object) => Promise<void>;

function datapoint(device: MO, extra: Record<string, unknown> = {}) {
  return {
    __active: true,
    __target: { id: device.id, name: device.name },
    fragment: FRAGMENT,
    series: SERIES,
    label: 'Generator temperature',
    unit: UNIT,
    min: 0,
    max: 100,
    color: '#1776bf',
    ...extra,
  };
}

async function createDashboard(
  api: APIRequestContext,
  device: MO,
  config: Record<string, unknown>
): Promise<MO> {
  const res = await api.post('/inventory/managedObjects', {
    data: {
      name: 'KPI Trend Dashboard',
      c8y_Dashboard: {
        name: 'KPI Trend Dashboard',
        icon: 'th',
        priority: 10000,
        children: {
          kt1: {
            id: 'kt1',
            componentId: WIDGET_ID,
            name: WIDGET_ID,
            title: 'KPI trend',
            config,
            _x: 0,
            _y: 0,
            _width: 5,
            _height: 4,
          },
        },
      },
      [`c8y_Dashboard!device!${device.id}`]: {},
    },
  });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

test.describe('KPI Trend Widget', () => {
  let device: MO;

  async function visitWithConfig(
    api: APIRequestContext,
    visitApp: VisitApp,
    config: Record<string, unknown>
  ) {
    const dashboard = await createDashboard(api, device, config);

    await visitApp(`device/${device.id}/dashboard/${dashboard.id}`, {
      language: 'en',
      // The widget's host is display: contents and has no box of its own.
      waitFor: `${WIDGET} .kpi-trend`,
    });
  }

  test.beforeEach(async ({ mock, api }) => {
    await mock.reset();
    const time = (i: number) => new Date(NOW - (HISTORY.length - 1 - i) * 5 * 60_000).toISOString();
    const res = await api.post('/inventory/managedObjects', {
      data: {
        name: `Generator ${NOW}`,
        c8y_IsDevice: {},
        // The widget reads the current value from here before the first realtime update.
        c8y_LatestMeasurements: {
          [FRAGMENT]: { [SERIES]: { value: CURRENT, unit: UNIT, time: time(HISTORY.length - 1) } },
        },
      },
    });

    expect(res.ok()).toBeTruthy();
    device = (await res.json()) as MO;

    for (const [i, value] of HISTORY.entries()) {
      const created = await api.post('/measurement/measurements', {
        data: {
          source: { id: device.id },
          type: FRAGMENT,
          time: time(i),
          [FRAGMENT]: { [SERIES]: { value, unit: UNIT } },
        },
      });

      expect(created.ok()).toBeTruthy();
    }
  });

  test('shows the value against its maximum in the radial layout', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    await visitWithConfig(api, visitApp, { datapoints: [datapoint(device)], variant: 'radial' });

    const widget = page.locator(WIDGET);

    await expect(widget.locator(cy('widget'))).toHaveAttribute('data-variant', 'radial');
    await expect(widget.locator(cy('label'))).toContainText('Generator temperature');
    await expect(widget.locator(cy('window'))).toHaveText('(1h)');
    await expect(widget.locator(cy('gauge'))).toHaveAttribute('data-state', 'default');
    await expect(widget.locator(cy('value'))).toContainText(String(CURRENT));
    await expect(widget.locator(cy('unit'))).toContainText(UNIT);
    // The history is rising, and a higher value is better by default.
    await expect(widget.locator(cy('sparkline'))).toHaveAttribute('d', /^M /);
    await expect(widget.locator(cy('trend'))).toHaveAttribute('data-trend', 'good');
    await expect(widget.locator(cy('trend'))).toContainText('▲');
    await reviewScreenshot('kpi-trend-widget/radial');
  });

  test('shows the value as a percentage ring in the compact layout', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    await visitWithConfig(api, visitApp, {
      datapoints: [datapoint(device, { max: 200 })],
      variant: 'compact',
    });

    const widget = page.locator(WIDGET);

    await expect(widget.locator(cy('widget'))).toHaveAttribute('data-variant', 'compact');
    await expect(widget.locator(cy('value'))).toHaveText(String(CURRENT));
    await expect(widget.locator(cy('unit'))).toHaveText(UNIT);
    await expect(widget.locator(cy('ring-percent'))).toHaveText('36%');
    await reviewScreenshot('kpi-trend-widget/compact');
  });

  test('colors the gauge when the value is in the red range', async ({ page, api, visitApp }) => {
    await visitWithConfig(api, visitApp, {
      datapoints: [datapoint(device, { redRangeMin: 70, redRangeMax: 100 })],
      variant: 'compact',
    });

    await expect(page.locator(WIDGET).locator(cy('ring'))).toHaveAttribute(
      'data-state',
      'critical'
    );
  });

  test('shows the bare value without a maximum', async ({ page, api, visitApp }) => {
    await visitWithConfig(api, visitApp, {
      datapoints: [datapoint(device, { max: null })],
      variant: 'radial',
    });

    await expect(page.locator(WIDGET).locator(cy('gauge'))).toHaveCount(0);
    await expect(page.locator(WIDGET).locator(cy('value'))).toHaveText(String(CURRENT));
  });

  test('asks for a data point when none is configured', async ({ page, api, visitApp }) => {
    await visitWithConfig(api, visitApp, { datapoints: [] });

    await expect(page.locator(`${WIDGET} c8y-ui-empty-state`)).toBeVisible();
  });

  test('saves the layout chosen in the Appearance section', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    await visitWithConfig(api, visitApp, { datapoints: [datapoint(device)], variant: 'radial' });
    await shell(page).dashboard.editWidget(0);

    await page.getByRole('button', { name: 'Appearance' }).click();
    // The radio is visually hidden (sr-only): its preview card label takes the click.
    const compactCard = page.locator(
      '[data-cy="kpi-trend-config--variant"][data-variant="compact"]'
    );

    await compactCard.click();
    await expect(compactCard.locator('[data-cy="kpi-trend-config--variant-radio"]')).toBeChecked();
    // Only the dialog's preview can be compact before the save: it follows the form.
    await expect(
      shell(page).widgetConfig.root.locator(WIDGET).locator(cy('widget'))
    ).toHaveAttribute('data-variant', 'compact');
    await reviewScreenshot('kpi-trend-widget/config');

    const saved = page.waitForRequest(
      (req) => req.method() === 'PUT' && /\/inventory\/managedObjects\/\d+/.test(req.url())
    );

    await shell(page).widgetConfig.save();
    await shell(page).dashboard.save();

    const children = (await saved).postDataJSON().c8y_Dashboard.children as Record<
      string,
      { config: Record<string, unknown> }
    >;

    expect(Object.values(children)[0].config).toHaveProperty('variant', 'compact');
    // The widget on the dashboard, not the preview of the config modal (which lingers while the modal closes).
    await expect(
      shell(page).dashboard.widgets.locator(WIDGET).locator(cy('widget'))
    ).toHaveAttribute('data-variant', 'compact');
  });
});
