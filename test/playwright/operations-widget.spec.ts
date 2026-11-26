import { expect, test } from './support/fixtures';
import type { APIRequestContext, Page, Request } from '@playwright/test';
import { DASHBOARD_READY, shell } from './support/dashboard';

/**
 * Operations Widget — runs against the tenant mock (windy-dev world), reset before every test.
 * Each test creates its own agent device and a device dashboard holding one configured widget.
 */
const WIDGET_ID = 'c8y.operations-widget.plugin';
const WIDGET = 'c8y-operations-widget';
const BUTTON = `${WIDGET} button-instance button`;
const MODAL = '.modal-content';

interface MO {
  id: string;
  name: string;
  c8y_SupportedOperations?: string[];
}

interface ButtonConfig {
  label: string;
  description: string;
  operationFragment: string;
  operationValue: string;
  showModal: boolean;
  modalText?: string;
  buttonClasses?: string;
  icon?: string;
  fields?: unknown[];
}

type VisitApp = (path?: string, options?: object) => Promise<void>;

const path = (r: Request) => new URL(r.url()).pathname;
const isOperationPost = (r: Request) =>
  r.method() === 'POST' && path(r).endsWith('/devicecontrol/operations');

/** Creates a device with supported operations in the (mock) inventory. */
async function createTestDevice(api: APIRequestContext): Promise<MO> {
  const res = await api.post('/inventory/managedObjects', {
    data: {
      name: `Ops Device ${Date.now()}`,
      c8y_IsDevice: {},
      c8y_SupportedOperations: ['c8y_Restart', 'c8y_Command'],
      // the mock only accepts operations for agents
      com_cumulocity_model_Agent: {},
    },
  });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

/** Creates a device dashboard holding one operations widget with the given config. */
async function createDashboard(
  api: APIRequestContext,
  device: MO,
  config: Record<string, unknown>
): Promise<MO> {
  const widgetKey = `${Date.now()}`;
  const children = {
    [widgetKey]: {
      id: widgetKey,
      componentId: WIDGET_ID,
      name: WIDGET_ID,
      title: 'Operations',
      config,
      _x: 0,
      _y: 0,
      _width: 12,
      _height: 6,
    },
  };
  const res = await api.post('/inventory/managedObjects', {
    data: {
      name: 'Ops Dashboard',
      c8y_Dashboard: { name: 'Ops Dashboard', icon: 'th', priority: 10000, children },
      [`c8y_Dashboard!device!${device.id}`]: {},
    },
  });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

const deviceRef = (device: MO) => ({
  id: device.id,
  name: device.name,
  c8y_SupportedOperations: device.c8y_SupportedOperations,
});

function restartButton(device: MO, overrides: Partial<ButtonConfig> = {}): ButtonConfig {
  return {
    label: 'Restart',
    description: 'Restart the device',
    operationFragment: 'c8y_Restart',
    operationValue: JSON.stringify({ deviceId: device.id, c8y_Restart: {} }),
    showModal: false,
    buttonClasses: 'btn-primary',
    icon: 'refresh',
    fields: [],
    ...overrides,
  };
}

async function visitDevice(
  page: Page,
  visitApp: VisitApp,
  device: MO,
  selector = WIDGET
): Promise<void> {
  await visitApp(`device/${device.id}`, { language: 'en', waitFor: selector });
  // the shell redirects to the dashboard route and re-renders the widget; wait for that
  await expect(page).toHaveURL(/\/dashboard\//);
  await expect(page.locator(selector)).toBeVisible();
}

const button = (page: Page, label: string) => page.locator(BUTTON).filter({ hasText: label });

test.describe('Operations Widget', () => {
  let device: MO;

  test.beforeEach(async ({ mock, api }) => {
    await mock.reset();
    device = await createTestDevice(api);
  });

  test('is listed in the add-widget dialog and opens its config form', async ({
    page,
    api,
    visitApp,
  }) => {
    await createDashboard(api, device, {});
    await visitApp(`device/${device.id}`, { language: 'en', waitFor: DASHBOARD_READY });
    await shell(page).dashboard.addWidget('Operations');
    await expect(page.locator('app-operations-widget-config')).toBeAttached();
  });

  test('renders configured buttons with label, color, icon and description', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    await createDashboard(api, device, {
      device: deviceRef(device),
      buttons: [
        restartButton(device),
        restartButton(device, {
          label: 'Second',
          description: 'Second button',
          buttonClasses: 'btn-danger',
          icon: undefined,
        }),
      ],
    });
    await visitDevice(page, visitApp, device);

    await expect(page.locator(`${WIDGET} button-instance`)).toHaveCount(2);
    const first = page.locator(BUTTON).first();

    await expect(first).toContainText('Restart');
    await expect(first).toHaveClass(/btn-primary/);
    await expect(first).toHaveAttribute('title', 'Restart the device');
    await expect(first.locator('i')).toHaveCount(1);
    const second = page.locator(BUTTON).nth(1);

    await expect(second).toContainText('Second');
    await expect(second).toHaveClass(/btn-danger/);
    await expect(second.locator('i')).toHaveCount(0);
    await reviewScreenshot('operations-widget/buttons');
  });

  test('creates the operation directly when no confirmation is required', async ({
    page,
    api,
    visitApp,
  }) => {
    await createDashboard(api, device, {
      device: deviceRef(device),
      buttons: [restartButton(device)],
    });
    await visitDevice(page, visitApp, device);

    const create = page.waitForResponse((r) => isOperationPost(r.request()));

    await button(page, 'Restart').click();

    const response = await create;

    expect(response.request().postDataJSON()).toMatchObject({
      deviceId: device.id,
      c8y_Restart: {},
      description: 'Restart the device',
    });
    expect(response.status()).toBeLessThan(300);
    await expect(shell(page).alerts.messages.and(page.locator('.alert-success'))).toContainText(
      "Operation 'Restart' successfully created."
    );
  });

  test('shows an error alert when creating the operation fails', async ({
    page,
    api,
    visitApp,
  }) => {
    await createDashboard(api, device, {
      device: deviceRef(device),
      buttons: [restartButton(device)],
    });
    await page.route(
      (url) => url.pathname.endsWith('/devicecontrol/operations'),
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 500, json: {} })
          : route.fallback()
    );
    await visitDevice(page, visitApp, device);

    const create = page.waitForRequest(isOperationPost);

    await button(page, 'Restart').click();
    await create;
    await expect(shell(page).alerts.messages.and(page.locator('.alert-danger'))).toContainText(
      "Failed to create 'Restart' operation."
    );
  });

  test('asks for confirmation and only sends the operation after confirming', async ({
    page,
    api,
    visitApp,
  }) => {
    await createDashboard(api, device, {
      device: deviceRef(device),
      buttons: [restartButton(device, { showModal: true, modalText: 'Really restart?' })],
    });
    const posts: Request[] = [];

    page.on('request', (r) => isOperationPost(r) && posts.push(r));
    await visitDevice(page, visitApp, device);

    // cancel: no request
    await button(page, 'Restart').click();
    // the confirm modal nests a second .modal-content: assert on the outermost
    await expect(page.locator(MODAL).first()).toContainText('Really restart?');
    await page.locator(`${MODAL} button[title="Cancel"]`).first().click();
    await expect(page.locator(MODAL)).toHaveCount(0);
    expect(posts).toHaveLength(0);

    // confirm: request sent
    const create = page.waitForRequest(isOperationPost);

    await button(page, 'Restart').click();
    await page.locator(`${MODAL} button[title="Confirm"]`).click();
    expect((await create).postDataJSON().c8y_Restart).toEqual({});
    await expect(shell(page).alerts.messages.and(page.locator('.alert-success'))).toBeVisible();
  });

  test('collects placeholder values in a form, previews the payload and sends it', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    await createDashboard(api, device, {
      device: deviceRef(device),
      buttons: [
        restartButton(device, {
          label: 'Command',
          description: 'Send shell command',
          operationFragment: 'c8y_Command',
          operationValue: JSON.stringify({
            deviceId: device.id,
            c8y_Command: { text: '{{text}}', mode: '{{mode}}' },
          }),
          fields: [
            {
              key: 'text',
              path: 'c8y_Command.text',
              label: 'Command text',
              type: 'input',
              options: [],
            },
            {
              key: 'mode',
              path: 'c8y_Command.mode',
              label: 'Mode',
              type: 'select',
              options: [
                { label: 'Fast', value: 'fast' },
                { label: 'Slow', value: 'slow' },
              ],
            },
          ],
        }),
      ],
    });
    await visitDevice(page, visitApp, device);

    await button(page, 'Command').click();
    await expect(page.locator(MODAL)).toContainText('Configure Operation');
    expect(await page.locator(`${MODAL} formly-form input`).count()).toBeGreaterThanOrEqual(1);
    const send = page.locator(`${MODAL} button.btn-primary`).filter({ hasText: 'Send' });

    await expect(send).toBeDisabled();

    await page.locator(`${MODAL} formly-form input[type="text"]`).first().fill('reboot now');
    await page.locator(`${MODAL} formly-form select`).selectOption({ label: 'Slow' });
    await expect(page.locator(`${MODAL} pre code`)).toContainText('reboot now');
    await expect(page.locator(`${MODAL} pre code`)).toContainText('slow');
    await reviewScreenshot('operations-widget/command-modal');

    const create = page.waitForRequest(isOperationPost);

    await expect(send).toBeEnabled();
    await send.click();
    const body = (await create).postDataJSON();

    expect(body).toMatchObject({ deviceId: device.id, description: 'Send shell command' });
    expect(body.c8y_Command).toEqual({ text: 'reboot now', mode: 'slow' });
  });

  test('shows an error when no target device is configured', async ({ page, api, visitApp }) => {
    await createDashboard(api, device, { buttons: [restartButton(device)] });
    await visitDevice(page, visitApp, device);

    await button(page, 'Restart').click();
    await expect(shell(page).alerts.messages.and(page.locator('.alert-danger'))).toContainText(
      'No target device configured'
    );
  });

  test('configures a new button in the config form and saves it to the dashboard', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    const dashboard = await createDashboard(api, device, {
      device: deviceRef(device),
      buttons: [],
    });

    await visitApp(`device/${device.id}`, { language: 'en', waitFor: DASHBOARD_READY });
    await shell(page).dashboard.editWidget(0);

    const config = page.locator('app-operations-widget-config');

    await config.locator('button').filter({ hasText: 'Add First Button' }).click();
    // supported operations come from the device and are offered in a select
    await expect(config.locator('select#operation_0')).toHaveValue('c8y_Command');
    await config.locator('select#operation_0').selectOption('c8y_Restart');
    await config.locator('input#label_0').fill('Reboot');
    await config.locator('input#description_0').fill('Reboot it');
    await config.locator('button[title="Color of the button"]').click();
    await config.locator('.dropdown-menu button').filter({ hasText: 'btn-success' }).click();
    await expect(config.locator('button[title="Color of the button"]')).toContainText(
      'btn-success'
    );
    // the operation body editor seeds an `{{test}}` placeholder, which becomes a form field
    await expect(config.locator('operations-editor')).toBeAttached();
    await expect(config.locator('input[placeholder="Key"]')).toHaveValue('test');
    await config.locator('input[placeholder="Label"]').first().fill('Test value');
    // confirmation is only offered for buttons without placeholders
    await expect(config.locator('label').filter({ hasText: 'Requires confirmation' })).toHaveCount(
      0
    );
    await config
      .locator('button')
      .filter({ hasText: /^\s*Add Button\s*$/ })
      .click();
    await expect(config.locator('.button-config')).toHaveCount(2);
    await config
      .locator('.button-config')
      .filter({ hasText: '2. Button' })
      .locator('button')
      .filter({ hasText: 'Delete Button' })
      .click();
    await expect(config.locator('.button-config')).toHaveCount(1);
    await reviewScreenshot('operations-widget/config');

    const save = page.waitForRequest(
      (r) => r.method() === 'PUT' && path(r).endsWith(`/inventory/managedObjects/${dashboard.id}`)
    );

    await shell(page).widgetConfig.save();
    await shell(page).dashboard.save();

    const children = (await save).postDataJSON().c8y_Dashboard.children as Record<
      string,
      { config: { buttons: ButtonConfig[] } }
    >;
    const saved = Object.values(children)[0].config;

    expect(saved.buttons).toHaveLength(1);
    expect(saved.buttons[0]).toMatchObject({
      label: 'Reboot',
      description: 'Reboot it',
      operationFragment: 'c8y_Restart',
      buttonClasses: 'btn-success',
      showModal: false,
    });
    expect(saved.buttons[0].fields).toEqual([
      { key: 'test', path: 'c8y_Restart.example', label: 'Test value', type: 'input', options: [] },
    ]);
    expect(JSON.parse(saved.buttons[0].operationValue)).toHaveProperty('deviceId', device.id);
    // the dashboard renders the widget twice while leaving edit mode
    await expect(page.locator(BUTTON).first()).toContainText('Reboot');
  });
});
