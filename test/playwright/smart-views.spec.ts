import { readFileSync } from 'node:fs';
import { expect, settleClock, test } from './support/fixtures';
import { shell } from './support/dashboard';
import { selectors } from './selectors';
import type { APIRequestContext, Page, Request } from '@playwright/test';

/**
 * Smart Views — runs against the tenant mock (windy-dev world: 15 `wind_turbine` assets), reset before every test.
 *
 * Covered:
 *  - configuration page (Settings → Smart views): list, empty state, error state, navigator entry
 *  - "Add configuration" modal: asset definitions, DTM-derived columns (and the fallback to the
 *    default columns when DTM is unavailable), add/remove columns, validation, create → POST body,
 *    save failure
 *  - a created view appears in the navigator without a reload and opens its page
 *  - edit (pre-filled modal → PUT) and delete (confirm → DELETE; cancel keeps it)
 *  - smart view page: grid lists the assets matching the stored query, search narrows it while
 *    keeping the base query, the ID cell links to the asset, error states
 *  - "Export CSV": item count, export with the configured columns as CSV, done state
 *
 * The DTM microservice is not emulated by the mock, so `service/dtm/**` is stubbed in the browser.
 */
const CONFIG_TYPE = 'c8y_SmartViewConfiguration';
const ASSET_TYPE = 'wind_turbine';
const TURBINE_COUNT = 15;

const CONFIG_GRID = '[data-cy="smart-views--configuration-grid"]';
const ADD_BUTTON = '[data-cy="smart-views--add-configuration"]';
const NAME_INPUT = '[data-cy="smart-views--config-name"]';
const DEFINITION_SELECT = '[data-cy="smart-views--config-asset-definition"]';
const PRIORITY_INPUT = '[data-cy="smart-views--config-priority"]';
const COLUMN = '[data-cy="smart-views--config-column"]';
const ADD_COLUMN = '[data-cy="smart-views--config-add-column"]';
const REMOVE_COLUMN = '[data-cy="smart-views--config-remove-column"]';
const FROM_DEFINITION = '[data-cy="smart-views--config-columns-from-definition"]';
const SAVE = '[data-cy="smart-views--config-save"]';
const CANCEL = '[data-cy="smart-views--config-cancel"]';
const VIEW_GRID = '[data-cy="smart-views--view-grid"]';
const VIEW_ERROR = '[data-cy="smart-views--view-error"]';
const EXPORT_BUTTON = '[data-cy="smart-views--export"]';
const EXPORT_COUNT = '[data-cy="smart-views--export-count"]';
const EXPORT_CONFIRM = '[data-cy="smart-views--export-confirm"]';
const EXPORT_DONE = '[data-cy="smart-views--export-done"]';

const DEFAULT_COLUMNS = [
  { name: 'id', path: 'id', header: 'ID' },
  { name: 'name', path: 'name', header: 'Name' },
  { name: 'description', path: 'description', header: 'Description' },
];

interface MO {
  id: string;
  name: string;
}

type VisitApp = (path?: string, options?: object) => Promise<void>;

const path = (r: Request) => new URL(r.url()).pathname;
const isInventoryPost = (r: Request) =>
  r.method() === 'POST' &&
  path(r).endsWith('/inventory/managedObjects') &&
  r.postDataJSON()?.type === CONFIG_TYPE;
const isInventoryPut = (id: string) => (r: Request) =>
  r.method() === 'PUT' && path(r).endsWith(`/inventory/managedObjects/${id}`);
const isInventoryDelete = (id: string) => (r: Request) =>
  r.method() === 'DELETE' && path(r).endsWith(`/inventory/managedObjects/${id}`);
const isConfigurationList = (r: Request) =>
  r.method() === 'GET' &&
  path(r).endsWith('/inventory/managedObjects') &&
  new URL(r.url()).searchParams.get('type') === CONFIG_TYPE;

function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}`;
}

async function createMO(api: APIRequestContext, data: Record<string, unknown>): Promise<MO> {
  const res = await api.post('/inventory/managedObjects', { data });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

const createAssetDefinition = (api: APIRequestContext, name = ASSET_TYPE) =>
  createMO(api, { type: 'c8y_AssetDefinition', name, icon: { name: 'wind-turbine' } });

const createConfiguration = (
  api: APIRequestContext,
  name: string,
  overrides: Record<string, unknown> = {}
) =>
  createMO(api, {
    type: CONFIG_TYPE,
    name,
    c8y_SmartViewConfiguration: {
      icon: 'wind-turbine',
      query: `(type eq '${ASSET_TYPE}') and has(c8y_IsAsset)`,
      columns: [
        ...DEFAULT_COLUMNS,
        { name: 'serial', path: 'c8y_Hardware.serialNumber', header: 'Serial' },
      ],
      priority: 500,
      ...overrides,
    },
  });

/** The DTM microservice is not on the mock: answer its requests in the browser. */
async function stubDtm(page: Page, available = true): Promise<void> {
  if (!available) {
    await page.route(
      (url) => url.pathname.includes('/service/dtm/'),
      (route) => route.fulfill({ status: 503, json: {} })
    );

    return;
  }
  await page.route(
    (url) => url.pathname.endsWith(`/service/dtm/definitions/assets/${ASSET_TYPE}`),
    (route) =>
      route.fulfill({
        json: {
          identifier: ASSET_TYPE,
          composition: {
            allowedProperties: [{ identifier: 'name' }, { identifier: 'c8y_Hardware' }],
          },
        },
      })
  );
  await page.route(
    (url) => url.pathname.includes('/service/dtm/definitions/properties'),
    (route) =>
      route.fulfill({
        json: {
          definitions: [
            { identifier: 'name', jsonSchema: { title: 'Turbine name' } },
            { identifier: 'c8y_Hardware', jsonSchema: { title: 'Hardware' } },
          ],
        },
      })
  );
}

async function selectAssetDefinition(page: Page): Promise<void> {
  await page.locator(DEFINITION_SELECT).selectOption({ label: ASSET_TYPE });
}

async function visitConfigurationPage(page: Page, visitApp: VisitApp): Promise<void> {
  const list = page.waitForRequest(isConfigurationList);

  await visitApp('smart-views-configuration', { language: 'en', waitFor: ADD_BUTTON });
  await list;
}

async function visitSmartView(visitApp: VisitApp, id: string): Promise<void> {
  await visitApp(`smart-views/${id}`, { language: 'en', waitFor: '#navigator' });
}

const configGrid = (page: Page) => shell(page).dataGrid(page.locator(CONFIG_GRID));
const gridRow = (page: Page, text: string) => configGrid(page).row(text);
const viewRows = (page: Page) => shell(page).dataGrid(page.locator(VIEW_GRID)).rows;

/** The edit / remove buttons of a grid row show on hover. */
async function rowAction(page: Page, name: string, action: 'edit' | 'remove'): Promise<void> {
  const button =
    action === 'edit' ? selectors.dataGrid.editButtonInRow : selectors.dataGrid.removeButtonInRow;

  await configGrid(page).rowAction(name, button);
}

test.describe('Smart Views', () => {
  test.beforeEach(async ({ mock }) => {
    await mock.reset();
  });

  test.describe('configuration page', () => {
    test('shows the empty state and a Settings → Smart views navigator entry', async ({
      page,
      visitApp,
    }) => {
      await visitConfigurationPage(page, visitApp);

      await expect(page.locator('c8y-header-bar')).toContainText('Smart views configuration');
      await expect(page.locator(CONFIG_GRID)).toContainText('No smart view configurations found.');
      await expect(
        page.locator('c8y-navigator-outlet').getByText('Smart views', { exact: true })
      ).toBeAttached();
    });

    test('lists existing configurations with their query', async ({
      page,
      api,
      visitApp,
      reviewScreenshot,
    }) => {
      const name = uniqueName('Turbines');

      await createConfiguration(api, name);
      await visitConfigurationPage(page, visitApp);

      await expect(gridRow(page, name)).toContainText(`type eq '${ASSET_TYPE}'`);
      await reviewScreenshot('smart-views/configuration-list');
    });

    test('shows an error when the configurations cannot be loaded', async ({ page, visitApp }) => {
      await page.route(
        (url) =>
          url.pathname.endsWith('/inventory/managedObjects') &&
          url.searchParams.get('type') === CONFIG_TYPE,
        (route) =>
          route.request().method() === 'GET'
            ? route.fulfill({ status: 500, json: {} })
            : route.fallback()
      );
      await visitApp('smart-views-configuration', { language: 'en', waitFor: ADD_BUTTON });

      await expect(page.locator('[data-cy="smart-views--configuration-error"]')).toContainText(
        'Could not load smart view configurations.'
      );
    });
  });

  test.describe('create', () => {
    test.beforeEach(async ({ api }) => {
      await createAssetDefinition(api);
    });

    test('creates a configuration with DTM-derived columns and adds it to the navigator', async ({
      page,
      visitApp,
      reviewScreenshot,
    }) => {
      const name = uniqueName('Wind fleet');

      await stubDtm(page);
      await visitConfigurationPage(page, visitApp);

      await page.locator(ADD_BUTTON).click();
      await expect(page.locator(SAVE)).toBeDisabled();
      await expect(page.locator(COLUMN)).toHaveCount(DEFAULT_COLUMNS.length);
      await reviewScreenshot('smart-views/configuration-modal');

      await page.locator(NAME_INPUT).fill(name);
      const definition = page.waitForResponse((r) =>
        r.url().includes(`/service/dtm/definitions/assets/${ASSET_TYPE}`)
      );
      const properties = page.waitForResponse((r) =>
        r.url().includes('/service/dtm/definitions/properties')
      );

      await selectAssetDefinition(page);
      await definition;
      await properties;

      await expect(page.locator(FROM_DEFINITION)).toBeVisible();
      // id + description defaults stay, `name` is replaced by the DTM column, plus c8y_Hardware.
      await expect(page.locator(COLUMN)).toHaveCount(4);
      await expect(page.locator(COLUMN).nth(3).locator('input').nth(2)).toHaveValue('Hardware');

      await page.locator(PRIORITY_INPUT).fill('900');
      const create = page.waitForRequest(isInventoryPost);

      await expect(page.locator(SAVE)).toBeEnabled();
      await page.locator(SAVE).click();
      await settleClock(page);

      const body = (await create).postDataJSON();

      expect(body.type).toBe(CONFIG_TYPE);
      expect(body.name).toBe(name);
      expect(body.c8y_SmartViewConfiguration).toMatchObject({
        query: `(type eq '${ASSET_TYPE}') and has(c8y_IsAsset)`,
        icon: 'wind-turbine',
        priority: 900,
        assetDefinitionName: ASSET_TYPE,
      });
      expect(body.c8y_SmartViewConfiguration.columns).toContainEqual({
        name: 'name',
        path: 'name',
        header: 'Turbine name',
      });

      await expect(shell(page).alerts.messages).toContainText('Smart view configuration created.');
      await expect(gridRow(page, name)).toHaveCount(1);

      // The navigator factory refreshes on change: the new view is reachable without a reload.
      await page.locator('c8y-navigator-outlet').getByText(name).dispatchEvent('click');
      await expect(page).toHaveURL(/#\/smart-views\/\d+/);
      await settleClock(page);
      await expect(viewRows(page)).toHaveCount(TURBINE_COUNT);
    });

    test('keeps the default columns when DTM is unavailable and supports adding/removing columns', async ({
      page,
      visitApp,
    }) => {
      await stubDtm(page, false);
      await visitConfigurationPage(page, visitApp);

      await page.locator(ADD_BUTTON).click();
      const dtm = page.waitForResponse((r) => r.url().includes('/service/dtm/'));

      await selectAssetDefinition(page);
      await dtm;

      await expect(page.locator(FROM_DEFINITION)).toHaveCount(0);
      await expect(page.locator(COLUMN)).toHaveCount(DEFAULT_COLUMNS.length);

      await page.locator(ADD_COLUMN).click();
      await expect(page.locator(COLUMN)).toHaveCount(DEFAULT_COLUMNS.length + 1);
      await page.locator(COLUMN).last().locator(REMOVE_COLUMN).click();
      await expect(page.locator(COLUMN)).toHaveCount(DEFAULT_COLUMNS.length);

      // No name yet → not savable; cancel closes without a request.
      await expect(page.locator(SAVE)).toBeDisabled();
      await page.locator(CANCEL).click();
      await expect(page.locator(NAME_INPUT)).toHaveCount(0);
    });

    test('shows an error alert when saving fails', async ({ page, visitApp }) => {
      await stubDtm(page, false);
      // only the configuration's POST fails: the shell creates other MOs on load, and their failure alert would cover the page
      await page.route(
        (url) => url.pathname.endsWith('/inventory/managedObjects'),
        (route) =>
          route.request().method() === 'POST' &&
          route.request().postDataJSON()?.type === CONFIG_TYPE
            ? route.fulfill({ status: 500, json: {} })
            : route.fallback()
      );
      await visitConfigurationPage(page, visitApp);

      await page.locator(ADD_BUTTON).click();
      await page.locator(NAME_INPUT).fill('Failing view');
      await selectAssetDefinition(page);
      const create = page.waitForRequest(isInventoryPost);

      await page.locator(SAVE).click();
      await settleClock(page);
      await create;

      await expect(shell(page).alerts.messages).toContainText(
        'Could not save smart view configuration.'
      );
      await expect(page.locator(NAME_INPUT)).toBeVisible();
    });
  });

  test.describe('edit and delete', () => {
    test('edits a configuration in the pre-filled modal', async ({ page, api, visitApp }) => {
      const name = uniqueName('Editable');
      const definition = await createAssetDefinition(api);
      const config = await createConfiguration(api, name, {
        assetDefinitionId: definition.id,
        assetDefinitionName: ASSET_TYPE,
      });

      await visitConfigurationPage(page, visitApp);

      await rowAction(page, name, 'edit');
      await expect(page.locator(NAME_INPUT)).toHaveValue(name);
      await expect(page.locator(COLUMN)).toHaveCount(4);
      await page.locator(NAME_INPUT).fill(`${name} v2`);
      const update = page.waitForRequest(isInventoryPut(config.id));

      await expect(page.locator(SAVE)).toContainText('Save');
      await page.locator(SAVE).click();
      await settleClock(page);

      expect((await update).postDataJSON().name).toBe(`${name} v2`);
      await expect(shell(page).alerts.messages).toContainText('Smart view configuration updated.');
      await expect(gridRow(page, `${name} v2`)).toHaveCount(1);
    });

    test('keeps a hand-written query when a configuration is renamed', async ({
      page,
      api,
      visitApp,
    }) => {
      const name = uniqueName('Handwritten');
      const query = "(name eq 'WTG*') and has(c8y_IsAsset)";
      const definition = await createAssetDefinition(api);
      const config = await createConfiguration(api, name, {
        assetDefinitionId: definition.id,
        assetDefinitionName: ASSET_TYPE,
        query,
      });

      await visitConfigurationPage(page, visitApp);

      await rowAction(page, name, 'edit');
      await expect(page.locator(NAME_INPUT)).toHaveValue(name);
      await page.locator(NAME_INPUT).fill(`${name} v2`);
      const update = page.waitForRequest(isInventoryPut(config.id));

      await page.locator(SAVE).click();
      await settleClock(page);

      expect((await update).postDataJSON().c8y_SmartViewConfiguration.query).toBe(query);
    });

    test('deletes a configuration after confirmation', async ({ page, api, visitApp }) => {
      const name = uniqueName('Deletable');
      const config = await createConfiguration(api, name);

      await visitConfigurationPage(page, visitApp);

      await rowAction(page, name, 'remove');
      await expect(shell(page).confirmModal.root).toContainText(
        `Are you sure you want to delete "${name}"?`
      );
      await shell(page).confirmModal.cancel();
      await expect(gridRow(page, name)).toHaveCount(1);

      await rowAction(page, name, 'remove');
      const del = page.waitForRequest(isInventoryDelete(config.id));

      await shell(page).confirmModal.confirm();
      await del;
      await settleClock(page);
      await expect(page.locator(CONFIG_GRID)).not.toContainText(name);
    });
  });

  test.describe('smart view page', () => {
    let config: MO;

    test.beforeEach(async ({ api }) => {
      config = await createConfiguration(api, uniqueName('Turbine view'));
    });

    test('lists the assets matching the stored query with the configured columns', async ({
      page,
      visitApp,
      reviewScreenshot,
    }) => {
      await visitSmartView(visitApp, config.id);

      await expect(viewRows(page)).toHaveCount(TURBINE_COUNT);
      await expect(page.locator(`${VIEW_GRID} thead`)).toContainText('Serial');
      await expect(viewRows(page).first().locator('a[href*="/group/"]')).toBeAttached();
      await reviewScreenshot('smart-views/smart-view');
    });

    test('narrows the list with search while keeping the base query', async ({
      page,
      visitApp,
    }) => {
      await visitSmartView(visitApp, config.id);
      await expect(viewRows(page)).toHaveCount(TURBINE_COUNT);

      const search = page.waitForRequest(
        (r) =>
          r.method() === 'GET' &&
          path(r).endsWith('/inventory/managedObjects') &&
          r.url().includes('CUWTG05')
      );

      await page.locator(`${VIEW_GRID} input[type="search"]`).first().fill('CUWTG05');
      // the grid's search debounces: let a frozen clock release it
      await settleClock(page);
      const decoded = decodeURIComponent((await search).url()).replace(/\+/g, ' ');

      expect(decoded).toContain(`type eq '${ASSET_TYPE}'`);
      expect(decoded).toContain('*CUWTG05*');
      await expect(viewRows(page)).toHaveCount(1);
      await expect(viewRows(page)).toContainText('CUWTG05');
    });

    test('opens the asset from the ID cell', async ({ page, visitApp }) => {
      await visitSmartView(visitApp, config.id);

      await viewRows(page).first().locator('a[href*="/group/"]').click();
      await expect(page).toHaveURL(/#\/group\/\d+/);
    });

    test('shows an error for a missing managed object and for one without configuration', async ({
      page,
      api,
      visitApp,
    }) => {
      await visitSmartView(visitApp, '999999999');
      await expect(page.locator(VIEW_ERROR)).toContainText(
        'Could not load smart view with ID "999999999".'
      );

      const plain = await createMO(api, { name: 'Plain MO' });

      await visitSmartView(visitApp, plain.id);
      await expect(page.locator(VIEW_ERROR)).toContainText(
        'This managed object has no smart-view configuration.'
      );
    });
  });

  test.describe('CSV export', () => {
    test('exports all matching assets with the configured columns', async ({
      page,
      api,
      visitApp,
    }) => {
      const name = uniqueName('Export view');
      const config = await createConfiguration(api, name);

      await visitSmartView(visitApp, config.id);
      await expect(viewRows(page)).toHaveCount(TURBINE_COUNT);

      await page.locator(EXPORT_BUTTON).click();
      await expect(page.locator(EXPORT_COUNT)).toHaveText(String(TURBINE_COUNT));
      const download = page.waitForEvent('download');

      await expect(page.locator(EXPORT_CONFIRM)).toBeEnabled();
      await page.locator(EXPORT_CONFIRM).click();
      await expect(page.locator(EXPORT_DONE)).toContainText('Your download has started.');

      const file = await download;

      expect(file.suggestedFilename()).toBe(`${name}.csv`);
      const csv = readFileSync(await file.path(), 'utf8');
      const lines = csv.trim().split(/\r?\n/);

      expect(lines[0]).toContain('ID');
      expect(lines[0]).toContain('Name');
      expect(lines[0]).toContain('Serial');
      expect(lines).toHaveLength(TURBINE_COUNT + 1);
      expect(csv).toContain('CUWTG05');
    });

    test('is only offered on the smart view page', async ({ page, visitApp }) => {
      await visitConfigurationPage(page, visitApp);
      await expect(page.locator(EXPORT_BUTTON)).toHaveCount(0);
    });
  });
});
