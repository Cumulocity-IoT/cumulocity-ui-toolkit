import { expect, test } from './support/fixtures';
import type { APIRequestContext, Locator, Page, Request } from '@playwright/test';
import { DASHBOARD_READY, shell } from './support/dashboard';
import { selectors } from './selectors';

/**
 * Layered Map widget (`iot.cumulocity.layered.map.widget`) e2e — runs against the tenant mock (windy-dev world)
 * inside the cockpit shell. Converted from cypress/e2e/layered-map-widget-plugin.cy.ts.
 *
 * Widget: leaflet map, a base tile layer + one overlay per configured query layer (Inventory / Alarm / Event
 * query → markers at the devices' `c8y_Position`), a layer control to toggle overlays, marker popups (device link,
 * last update, alarms, latest values), auto-center / manual center.
 *
 * Config: map provider (built-in + custom base layers stored in inventory), auto-center vs manual center
 * (lat/lng/zoom + picker modal), position polling, layers list (add / edit / delete / popover settings).
 *
 * Data is created via API on the mock once per file (devices with `c8y_Position`, alarms, events, dashboards).
 * External map tiles are stubbed in the browser.
 */
const WIDGET_ID = 'iot.cumulocity.layered.map.widget';
const DEVICE_TYPE = 'lm_e2e_tracker';
const ALARM_TYPE = 'lm_e2e_alarm';
const EVENT_TYPE = 'lm_e2e_event';
const WIDGET = 'layered-map-widget';
/**
 * "Now" for the seeded data: the page's clock. In a frozen run (`--frozen`) the page's `Date` stands a minute after
 * the world's `now`, so data created from Node's real clock would lie in the page's future.
 */
const NOW = process.env.C8Y_FROZEN_NOW
  ? new Date(process.env.C8Y_FROZEN_NOW).getTime() + 60_000
  : Date.now();
const MARKER = `${WIDGET} .leaflet-marker-pane .c8y-map-marker-icon`;
const TRANSPARENT_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);

type Layer = { config: Record<string, unknown>; active: boolean };
interface MO {
  id: string;
  name: string;
}
type VisitApp = (
  path?: string,
  options?: { language?: string; waitFor?: string; timeout?: number }
) => Promise<void>;

const path = (r: Request) => new URL(r.url()).pathname;
const isOsmTile = (url: URL) => /tile\.openstreetmap\.org$/.test(url.hostname);
const isOtherTile = (url: URL) =>
  /(arcgisonline\.com|cartocdn\.com|opentopomap\.org)$/.test(url.hostname);
const isCustomTile = (url: URL) => url.hostname === 'tiles.e2e.example';

const devices: MO[] = [];
let host: MO;

function layer(
  name: string,
  type: 'Inventory' | 'Alarm' | 'Event',
  filter: Record<string, unknown>,
  extra = {}
): Layer {
  return {
    active: true,
    config: {
      name,
      icon: 'globe',
      color: '#ff0000',
      enablePolling: false,
      pollingInterval: 60,
      type,
      filter,
      popoverConfig: {
        showAlarms: true,
        showDate: true,
        showLatestValues: true,
        assetProperties: [],
        actions: [],
      },
      ...extra,
    },
  };
}

function inventoryLayer(name = 'Trackers', extra = {}): Layer {
  return layer(name, 'Inventory', { type: DEVICE_TYPE }, extra);
}

function widgetConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    layers: [inventoryLayer()],
    baseTileLayerId: 'osm',
    autoCenter: true,
    manualCenter: { lat: 0, long: 0, zoomLevel: 15 },
    positionPolling: { enabled: false, interval: 10 },
    saved: true,
    // the shell's widget config requires an asset selection before it can be saved
    device: { id: host.id, name: host.name },
    ...overrides,
  };
}

async function createMO(api: APIRequestContext, data: Record<string, unknown>): Promise<MO> {
  const res = await api.post('/inventory/managedObjects', { data });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

const createDevice = (api: APIRequestContext, data: Record<string, unknown>) =>
  createMO(api, { ...data, c8y_IsDevice: {} });

/** Creates a device dashboard holding one layered map widget (or none) and returns its id. */
async function createDashboard(
  api: APIRequestContext,
  config?: Record<string, unknown>
): Promise<string> {
  const children: Record<string, unknown> = {};

  if (config) {
    children['lmwidget'] = {
      id: 'lmwidget',
      name: WIDGET_ID,
      componentId: WIDGET_ID,
      title: 'Layered Map',
      config,
      _x: 0,
      _y: 0,
      _width: 24,
      _height: 8,
    };
  }
  const created = await createMO(api, {
    name: 'Layered map dashboard',
    [`c8y_Dashboard!device!${host.id}`]: {},
    c8y_Dashboard: { name: 'Layered map', icon: 'th', priority: 10000, columns: 24, children },
  });
  return created.id;
}

async function visitDashboard(
  visitApp: VisitApp,
  dashboardId: string,
  waitFor = `${WIDGET} .leaflet-container`
) {
  await visitApp(`device/${host.id}/dashboard/${dashboardId}`, {
    language: 'en',
    waitFor,
    timeout: 60_000,
  });
}

async function readWidgetConfig(
  api: APIRequestContext,
  dashboardId: string
): Promise<Record<string, unknown>> {
  const res = await api.get(`/inventory/managedObjects/${dashboardId}`);
  const children = (await res.json()).c8y_Dashboard.children as Record<
    string,
    { config: Record<string, unknown> }
  >;
  return Object.values(children)[0].config;
}

async function stubTiles(page: Page) {
  await page.route(
    (url) => isOsmTile(url) || isOtherTile(url) || isCustomTile(url),
    (route) => route.fulfill({ status: 200, contentType: 'image/png', body: TRANSPARENT_PNG })
  );
}

const layerItem = (page: Page, name: string) =>
  page.locator(`[data-cy="layered-map-config--layer"][data-layer-name="${name}"]`);

async function layerAction(page: Page, name: string, action: 'edit' | 'popover' | 'delete') {
  await layerItem(page, name).locator('.dropdown-toggle').first().click();
  await page
    .locator(`[data-cy="layered-map-config--layer-${action}"]`)
    .filter({ visible: true })
    .first()
    .click();
}

const saveWidgetConfig = (page: Page) => shell(page).widgetConfig.save();
const saveDashboard = (page: Page) => shell(page).dashboard.save();

const modalPrimary = (page: Page, root = 'c8y-modal') =>
  page.locator(`${root} button.btn-primary`).filter({ visible: true }).last();
const modalCancel = (page: Page) =>
  page
    .locator('c8y-modal button.btn-default')
    .filter({ visible: true })
    .filter({ hasText: 'Cancel' });

const markers = (page: Page): Locator => page.locator(MARKER);

test.describe('Layered Map Widget', () => {
  test.beforeAll(async ({ mock, api }) => {
    await mock.reset();
    const positions = [
      { lat: 51.2277, lng: 6.7735 },
      { lat: 51.2377, lng: 6.7835 },
      { lat: 51.2477, lng: 6.7935 },
    ];

    for (const [i, pos] of positions.entries()) {
      devices.push(
        await createDevice(api, {
          name: `LM tracker ${i + 1}`,
          type: DEVICE_TYPE,
          c8y_Position: pos,
          ...(i === 0
            ? {
                c8y_ActiveAlarmsStatus: { critical: 1 },
                c8y_LatestMeasurements: {
                  c8y_Temperature: {
                    T: { value: 21.5, unit: 'C', time: new Date(NOW).toISOString() },
                  },
                },
              }
            : {}),
        })
      );
    }
    // a device of the same type without position must not produce a marker
    await createDevice(api, { name: 'LM tracker no position', type: DEVICE_TYPE });
    host = await createDevice(api, { name: 'LM host' });

    const alarm = await api.post('/alarm/alarms', {
      data: {
        source: { id: devices[0].id },
        type: ALARM_TYPE,
        text: 'LM e2e alarm',
        severity: 'CRITICAL',
        time: new Date(NOW).toISOString(),
      },
    });

    expect(alarm.ok()).toBeTruthy();
    const event = await api.post('/event/events', {
      data: {
        source: { id: devices[1].id },
        type: EVENT_TYPE,
        text: 'LM e2e event',
        time: new Date(NOW).toISOString(),
      },
    });

    expect(event.ok()).toBeTruthy();
  });

  test.beforeEach(async ({ page }) => {
    await stubTiles(page);
  });

  test.describe('widget', () => {
    test('renders the map with the base tile layer and one marker per positioned device', async ({
      page,
      api,
      visitApp,
      reviewScreenshot,
    }) => {
      const osmTile = page.waitForRequest((r) => isOsmTile(new URL(r.url())));

      await visitDashboard(visitApp, await createDashboard(api, widgetConfig()));
      await osmTile;
      await expect(markers(page)).toHaveCount(3);
      // layer color/icon are applied to the marker
      await expect(markers(page).first().locator('.dlt-c8y-icon-marker')).toHaveAttribute(
        'style',
        /#ff0000/
      );
      await expect(markers(page).first().locator('i.dlt-c8y-icon-globe')).toBeAttached();
      await reviewScreenshot('layered-map-widget/map');
    });

    test('shows the overlays in the layer control and toggles them', async ({
      page,
      api,
      visitApp,
    }) => {
      await visitDashboard(
        visitApp,
        await createDashboard(
          api,
          widgetConfig({
            layers: [
              inventoryLayer('Trackers'),
              { ...inventoryLayer('Hidden layer', { icon: 'star' }), active: false },
            ],
          })
        )
      );
      await expect(markers(page)).toHaveCount(3);

      const overlays = page.locator(`${WIDGET} .leaflet-control-layers-overlays label`);

      await expect(overlays).toHaveCount(2);
      await expect(overlays.nth(0)).toContainText('Trackers');
      await expect(overlays.nth(0).locator('input')).toBeChecked();
      await expect(overlays.nth(1)).toContainText('Hidden layer');
      await expect(overlays.nth(1).locator('input')).not.toBeChecked();
      await expect(page.locator(`${WIDGET} .leaflet-control-layers-base label`)).toContainText(
        'OpenStreetMap'
      );

      // switching the active layer off removes its markers
      // native click on the (collapsed) control: a pointer click emits mouseover first, which runs
      // leaflet's expand guard (`_preventClick`) and swallows the click
      await overlays.nth(0).locator('input').dispatchEvent('click');
      await expect(overlays.nth(0).locator('input')).not.toBeChecked();
      await expect(markers(page)).toHaveCount(0);

      // the inactive layer is loaded when switched on
      await overlays.nth(1).locator('input').dispatchEvent('click');
      await expect(page.locator(`${MARKER} i.dlt-c8y-icon-star`)).toHaveCount(3);
    });

    test('opens a popup with device link, last update, alarms and latest values', async ({
      page,
      api,
      visitApp,
    }) => {
      await visitDashboard(visitApp, await createDashboard(api, widgetConfig()));
      await expect(markers(page)).toHaveCount(3);
      await markers(page).nth(0).dispatchEvent('click');
      const link = page.locator('[data-cy="layered-map-popup--link"]');

      await expect(link).toBeVisible();
      await expect(link).toHaveText(/LM tracker \d/);
      await expect(link).toHaveAttribute('href', /^#\/device\/\d+$/);
      await expect(page.locator('[data-cy="layered-map-popup--date"]')).toContainText(
        'Last update'
      );
      await expect(page.locator('[data-cy="layered-map-popup--alarms"]')).toBeAttached();
    });

    test('shows alarm status and latest values in the popup of a device that has them', async ({
      page,
      api,
      visitApp,
      reviewScreenshot,
    }) => {
      await visitDashboard(
        visitApp,
        await createDashboard(
          api,
          widgetConfig({
            layers: [
              layer(
                'Alarms',
                'Alarm',
                { type: ALARM_TYPE },
                {
                  popoverConfig: {
                    showAlarms: true,
                    showDate: false,
                    showLatestValues: true,
                    assetProperties: [],
                    actions: [],
                  },
                }
              ),
            ],
          })
        )
      );
      // only the alarm source gets a marker, flagged with the alarm severity
      await expect(markers(page)).toHaveCount(1);
      await expect(markers(page).locator('.status.critical')).toBeAttached();
      await markers(page).dispatchEvent('click');
      await expect(page.locator('[data-cy="layered-map-popup--link"]')).toContainText(
        'LM tracker 1'
      );
      await expect(
        page.locator('[data-cy="layered-map-popup--alarms"] .status.critical')
      ).toContainText('1');
      const values = page.locator('[data-cy="layered-map-popup--latest-values"]');

      await expect(values).toContainText('T');
      await expect(values).toContainText('21.5');
      await expect(page.locator('[data-cy="layered-map-popup--date"]')).toHaveCount(0);
      await reviewScreenshot('layered-map-widget/popup');
    });

    test('renders an event query layer at the event sources', async ({ page, api, visitApp }) => {
      await visitDashboard(
        visitApp,
        await createDashboard(
          api,
          widgetConfig({ layers: [layer('Events', 'Event', { type: EVENT_TYPE })] })
        )
      );
      await expect(markers(page)).toHaveCount(1);
      await markers(page).dispatchEvent('click');
      await expect(page.locator('[data-cy="layered-map-popup--link"]')).toContainText(
        'LM tracker 2'
      );
    });

    test('renders an empty map when a layer query matches nothing', async ({
      page,
      api,
      visitApp,
    }) => {
      const osmTile = page.waitForRequest((r) => isOsmTile(new URL(r.url())));

      await visitDashboard(
        visitApp,
        await createDashboard(
          api,
          widgetConfig({
            layers: [inventoryLayer('Nothing', { filter: { type: 'lm_does_not_exist' } })],
          })
        )
      );
      await osmTile;
      await expect(page.locator(`${WIDGET} .leaflet-control-layers`)).toBeAttached();
      await expect(markers(page)).toHaveCount(0);
    });

    test('centers the map manually when auto-center is off', async ({ page, api, visitApp }) => {
      const osmTile = page.waitForRequest((r) => isOsmTile(new URL(r.url())));

      await visitDashboard(
        visitApp,
        await createDashboard(
          api,
          widgetConfig({ autoCenter: false, manualCenter: { lat: 48.1, long: 11.5, zoomLevel: 7 } })
        )
      );
      // tile URLs carry the zoom level: {z}/{x}/{y}
      expect((await osmTile).url()).toMatch(/\/7\/\d+\/\d+\.png/);
    });

    test('uses a custom base tile layer stored in inventory', async ({ page, api, visitApp }) => {
      const { id } = await createMO(api, {
        type: 'ps_layeredMapBaseLayerConfig',
        name: 'Layered Map Base Layer Configuration',
        ps_layeredMapBaseLayers: {
          layers: [
            {
              id: 'custom-1',
              label: 'E2E tiles',
              url: 'https://tiles.e2e.example/{z}/{x}/{y}.png',
            },
          ],
        },
      });
      const customTile = page.waitForRequest((r) => isCustomTile(new URL(r.url())));

      await visitDashboard(
        visitApp,
        await createDashboard(api, widgetConfig({ baseTileLayerId: 'custom-1' }))
      );
      await customTile;
      await expect(page.locator(`${WIDGET} .leaflet-control-layers-base label`)).toContainText(
        'E2E tiles'
      );
      await api.delete(`/inventory/managedObjects/${id}`);
    });
  });

  test.describe('configuration', () => {
    test('can be added from the widget picker with sensible defaults', async ({
      page,
      api,
      visitApp,
      reviewScreenshot,
    }) => {
      await visitDashboard(visitApp, await createDashboard(api), DASHBOARD_READY);
      await shell(page).dashboard.addWidget('Layered Map');

      await expect(page.locator('[data-cy="layered-map-config--base-layer"]')).toHaveValue('osm');
      await expect(
        page.locator('[data-cy="layered-map-config--auto-center"] option:checked')
      ).toContainText('Fit all markers');
      await expect(page.locator('[data-cy="layered-map-config--center-lat"]')).toBeDisabled();
      await expect(
        page.locator('[data-cy="layered-map-config--position-polling"] option:checked')
      ).toContainText('No automatic polling');
      await expect(
        page.locator('[data-cy="layered-map-config--position-polling-interval"]')
      ).toBeDisabled();
      await expect(page.locator('[data-cy="layered-map-config--layer"]')).toHaveCount(0);
      await reviewScreenshot('layered-map-widget/config');
    });

    test('adds an inventory query layer and saves it', async ({ page, api, visitApp }) => {
      const dashboardId = await createDashboard(api, widgetConfig({ layers: [] }));

      await visitDashboard(visitApp, dashboardId);
      await shell(page).dashboard.editWidget(0);

      await page.locator('[data-cy="layered-map-config--add-layer"]').click();
      await page.locator('[data-cy="layered-map-layer--type"]').selectOption('QueryLayerConfig');
      await page.locator('[data-cy="layered-map-layer--name"]').fill('New trackers');
      await page.locator('[data-cy="layered-map-layer--icon"]').fill('truck');
      await expect(page.locator('c8y-modal ps-query-forms-tab')).toBeAttached();
      await page
        .locator('[data-cy="layered-map-layer--polling"]')
        .selectOption({ label: 'No automatic polling' });
      const ok = page
        .locator(`c8y-modal ${selectors.modal.confirm}, c8y-modal button.btn-primary`)
        .filter({ visible: true })
        .last();

      await expect(ok).toContainText('Create');
      await ok.click();

      await expect(layerItem(page, 'New trackers')).toBeVisible();
      await expect(layerItem(page, 'New trackers')).toContainText('No polling');
      const saved = page.waitForRequest(
        (r) => r.method() === 'PUT' && path(r).endsWith(`/inventory/managedObjects/${dashboardId}`)
      );

      await saveWidgetConfig(page);
      await saveDashboard(page);
      await (await saved).response();

      await expect
        .poll(async () => readWidgetConfig(api, dashboardId))
        .toMatchObject({
          saved: true,
          layers: [
            {
              active: true,
              config: {
                name: 'New trackers',
                icon: 'truck',
                type: 'Inventory',
                enablePolling: false,
              },
            },
          ],
        });
      expect((await readWidgetConfig(api, dashboardId))['layers']).toHaveLength(1);
    });

    test('requires a layer type and name before a layer can be created', async ({
      page,
      api,
      visitApp,
    }) => {
      await visitDashboard(visitApp, await createDashboard(api, widgetConfig({ layers: [] })));
      await shell(page).dashboard.editWidget(0);
      await page.locator('[data-cy="layered-map-config--add-layer"]').click();
      const ok = modalPrimary(page);

      await expect(ok).toBeDisabled();
      await page.locator('[data-cy="layered-map-layer--type"]').selectOption('QueryLayerConfig');
      await expect(ok).toBeDisabled();
      await page.locator('[data-cy="layered-map-layer--name"]').fill('x');
      await expect(ok).toBeEnabled();
      await modalCancel(page).click();
      await expect(page.locator('[data-cy="layered-map-config--layer"]')).toHaveCount(0);
    });

    test('edits and deletes layers', async ({ page, api, visitApp }) => {
      const dashboardId = await createDashboard(
        api,
        widgetConfig({ layers: [inventoryLayer('First'), inventoryLayer('Second')] })
      );

      await visitDashboard(visitApp, dashboardId);
      await shell(page).dashboard.editWidget(0);
      await expect(page.locator('[data-cy="layered-map-config--layer"]')).toHaveCount(2);

      await layerAction(page, 'First', 'edit');
      const name = page.locator('[data-cy="layered-map-layer--name"]');

      await expect(name).toHaveValue('First');
      await name.fill('Renamed');
      await page
        .locator('[data-cy="layered-map-layer--polling"]')
        .selectOption({ label: 'Activate polling' });
      const ok = modalPrimary(page);

      await expect(ok).toContainText('Update');
      await ok.click();
      await expect(layerItem(page, 'Renamed')).toContainText('60s');

      await layerAction(page, 'Second', 'delete');
      await expect(page.locator('[data-cy="layered-map-config--layer"]')).toHaveCount(1);

      const saved = page.waitForRequest(
        (r) => r.method() === 'PUT' && path(r).endsWith(`/inventory/managedObjects/${dashboardId}`)
      );

      await saveWidgetConfig(page);
      await saveDashboard(page);
      await (await saved).response();
      await expect
        .poll(async () => {
          const layers = (await readWidgetConfig(api, dashboardId))['layers'] as Layer[];
          return {
            names: layers.map((l) => l.config['name']),
            polling: layers[0].config['enablePolling'],
          };
        })
        .toEqual({ names: ['Renamed'], polling: true });
    });

    test('edits the popover settings of a layer', async ({
      page,
      api,
      visitApp,
      reviewScreenshot,
    }) => {
      const dashboardId = await createDashboard(api, widgetConfig());

      await visitDashboard(visitApp, dashboardId);
      await shell(page).dashboard.editWidget(0);
      await layerAction(page, 'Trackers', 'popover');
      const checkboxes = page.locator('c8y-modal formly-form input[type="checkbox"]');

      expect(await checkboxes.count()).toBeGreaterThanOrEqual(3);
      await reviewScreenshot('layered-map-widget/layer-popover-settings');
      await checkboxes.first().uncheck({ force: true });
      await modalPrimary(page).click();

      const saved = page.waitForRequest(
        (r) => r.method() === 'PUT' && path(r).endsWith(`/inventory/managedObjects/${dashboardId}`)
      );

      await saveWidgetConfig(page);
      await saveDashboard(page);
      await (await saved).response();
      await expect
        .poll(async () => {
          const popover = ((await readWidgetConfig(api, dashboardId))['layers'] as Layer[])[0]
            .config['popoverConfig'] as Record<string, boolean>;
          return {
            off: Object.values(popover).filter((v) => v === false).length >= 1,
            alarmsOrDate: popover['showAlarms'] === false || popover['showDate'] === false,
          };
        })
        .toEqual({ off: true, alarmsOrDate: true });
    });

    test('saves map provider, manual center and position polling', async ({
      page,
      api,
      visitApp,
    }) => {
      const dashboardId = await createDashboard(api, widgetConfig());

      await visitDashboard(visitApp, dashboardId);
      await shell(page).dashboard.editWidget(0);

      await page.locator('[data-cy="layered-map-config--base-layer"]').selectOption('carto-dark');
      await page
        .locator('[data-cy="layered-map-config--auto-center"]')
        .selectOption({ label: 'Set zoom-level and center map manually' });
      const lat = page.locator('[data-cy="layered-map-config--center-lat"]');

      await expect(lat).toBeEnabled();
      await lat.fill('48.5');
      await page.locator('[data-cy="layered-map-config--center-lng"]').fill('9.25');
      await page
        .locator('[data-cy="layered-map-config--position-polling"]')
        .selectOption({ label: 'Use position polling' });
      await expect(
        page.locator('[data-cy="layered-map-config--position-polling-interval"]')
      ).toBeEnabled();

      const saved = page.waitForRequest(
        (r) => r.method() === 'PUT' && path(r).endsWith(`/inventory/managedObjects/${dashboardId}`)
      );

      await saveWidgetConfig(page);
      await saveDashboard(page);
      await (await saved).response();
      await expect
        .poll(async () => readWidgetConfig(api, dashboardId))
        .toMatchObject({
          baseTileLayerId: 'carto-dark',
          autoCenter: false,
          manualCenter: { lat: 48.5, long: 9.25 },
          positionPolling: { enabled: true },
        });
    });

    test('opens the center picker modal', async ({ page, api, visitApp }) => {
      await visitDashboard(
        visitApp,
        await createDashboard(
          api,
          widgetConfig({ autoCenter: false, manualCenter: { lat: 50, long: 8, zoomLevel: 10 } })
        )
      );
      await shell(page).dashboard.editWidget(0);
      const picker = page.locator('[data-cy="layered-map-config--center-picker"]');

      await expect(picker).toBeEnabled();
      await picker.click();
      await expect(page.locator('c8y-modal .leaflet-container')).toBeVisible();
      await modalCancel(page).click();
      await expect(page.locator('[data-cy="layered-map-config--center-lat"]')).toHaveValue('50');
    });

    test('adds, edits and deletes a custom base layer', async ({ page, api, visitApp }) => {
      await visitDashboard(visitApp, await createDashboard(api, widgetConfig()));
      await shell(page).dashboard.editWidget(0);
      const isCreate = (r: Request) =>
        r.method() === 'POST' && path(r).endsWith('/inventory/managedObjects');
      const isUpdate = (r: Request) =>
        r.method() === 'PUT' && /\/inventory\/managedObjects\/[^/]+$/.test(path(r));

      await page.locator('[data-cy="layered-map-config--custom-base-layer-add"]').click();
      const ok = modalPrimary(page, 'ps-custom-base-layer-modal');

      await expect(ok).toBeDisabled();
      await page.locator('ps-custom-base-layer-modal input[type="text"]').first().fill('My tiles');
      await page
        .locator('ps-custom-base-layer-modal input[type="url"]')
        .fill('https://tiles.e2e.example/{z}/{x}/{y}.png');
      await expect(ok).toBeEnabled();
      const created = page.waitForRequest(isCreate);

      await ok.click();
      const body = (await created).postDataJSON();

      expect(body.type).toBe('ps_layeredMapBaseLayerConfig');
      expect(body.ps_layeredMapBaseLayers.layers[0]).toMatchObject({ label: 'My tiles' });
      await expect(page.locator('[data-cy="layered-map-config--custom-base-layer"]')).toContainText(
        'My tiles'
      );
      await expect(
        page.locator('[data-cy="layered-map-config--base-layer"] optgroup[label="Custom"] option')
      ).toContainText('My tiles');

      await page.locator('[data-cy="layered-map-config--custom-base-layer-edit"]').click();
      await page
        .locator('ps-custom-base-layer-modal input[type="text"]')
        .first()
        .fill('Renamed tiles');
      const updated = page.waitForRequest(isUpdate);

      await modalPrimary(page, 'ps-custom-base-layer-modal').click();
      await updated;
      await expect(page.locator('[data-cy="layered-map-config--custom-base-layer"]')).toContainText(
        'Renamed tiles'
      );

      const deleted = page.waitForRequest(isUpdate);

      await page.locator('[data-cy="layered-map-config--custom-base-layer-delete"]').click();
      expect((await deleted).postDataJSON().ps_layeredMapBaseLayers.layers).toHaveLength(0);
      await expect(page.locator('[data-cy="layered-map-config--custom-base-layer"]')).toHaveCount(
        0
      );
    });

    // Not covered: "Assets" layer type (needs the DTM microservice/app, not available on the
    // mock), popover actions (commented out in the source), track creation (commented out).
  });
});
