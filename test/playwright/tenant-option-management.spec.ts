import { readFileSync } from 'node:fs';
import { expect, settleClock, test } from './support/fixtures';
import { shell } from './support/dashboard';
import { selectors } from './selectors';
import type { APIRequestContext, Page, Request } from '@playwright/test';

/**
 * Tenant Option Management e2e — runs against the tenant mock (windy-dev world) inside the cockpit shell.
 * Converted from cypress/e2e/tenant-option-management-plugin.cy.ts. The mock is reset before every test: the world
 * has no plugin configuration MO, so the plugin creates it on its first visit, and no option of a test leaks into
 * the next. Error paths (409, 403, 500) are stubbed in the browser with page.route.
 */

const ROUTE = 'tenant-option-management';
const GRID = 'c8y-data-grid[data-cy="tenant-option-management--grid"]';
const KEY_CELL = selectors.dataGrid.header('Key');
const CONTENT_CELL = selectors.dataGrid.header('Content');
const MODAL = '.modal-content';
const ALERT_DANGER = `${selectors.alertOutlet.message}.alert-danger`;
const ALERT_SUCCESS = `${selectors.alertOutlet.message}.alert-success`;
const CHECKBOX = selectors.dataGrid.checkbox;
const dc = (name: string) => `[data-cy="${name}"]`;

let seq = 0;

function uniqueKey(prefix = 'key'): string {
  seq += 1;

  return `${prefix}${Date.now()}${seq}`;
}

const CATEGORY = 'cypresstom';

const path = (r: Request) => new URL(r.url()).pathname;
const isOptionsPost = (r: Request) => r.method() === 'POST' && path(r).endsWith('/tenant/options');
const isOptionPut = (key: string) => (r: Request) =>
  r.method() === 'PUT' && path(r).endsWith(`/tenant/options/${CATEGORY}/${key}`);
/** Only PUTs to the plugin configuration MO (the shell writes other MOs too). */
const isConfigUpdate = (r: Request) =>
  r.method() === 'PUT' &&
  /\/inventory\/managedObjects\/[^/]+$/.test(path(r)) &&
  Array.isArray(r.postDataJSON()?.options);

async function createTenantOption(
  api: APIRequestContext,
  category: string,
  key: string,
  value: string
) {
  await api.post('/tenant/options', { data: { category, key, value } });
}

const rowByKey = (page: Page, key: string) =>
  shell(page)
    .dataGrid(page.locator(GRID))
    .rows.filter({ has: page.locator(KEY_CELL, { hasText: key }) });
const modalRow = (page: Page, text: string) => shell(page).dataGrid(page.locator(MODAL)).row(text);

async function visitPlugin(page: Page, visitApp: (path?: string, o?: object) => Promise<void>) {
  // The grid is filled only once the option values are loaded too; acting before that races
  // the initial load, which replaces the rows when it completes.
  const config = page.waitForResponse((r) => r.url().includes('type=tenant_option_plugin_config'));
  const options = page.waitForResponse(
    (r) => path(r.request()).endsWith('/tenant/options') && r.request().method() === 'GET'
  );

  await visitApp(ROUTE, { language: 'en', waitFor: dc('tenant-option-management--create') });
  await Promise.all([config, options]);
  // c8y-data-grid debounces its row rendering: let a frozen clock release it
  await settleClock(page);
}

async function createViaModal(page: Page, category: string, key: string, value: string) {
  await page.locator(dc('tenant-option-management--create')).click();
  await expect(page.locator(MODAL)).toBeVisible();
  await page.locator(dc('add-option--category')).fill(category);
  await page.locator(dc('add-option--key')).fill(key);
  await page.locator(dc('add-option--value')).fill(value);
  await page.locator(dc('add-option--save')).click();
  await settleClock(page);
}

/** Edit / remove buttons of a grid row show on hover. */
async function rowAction(page: Page, key: string, action: 'edit' | 'remove') {
  const button =
    action === 'edit' ? selectors.dataGrid.editButtonInRow : selectors.dataGrid.removeButtonInRow;

  await shell(page).dataGrid(page.locator(GRID)).rowAction(key, button);
}

async function addExisting(page: Page, category: string, key?: string) {
  await page.locator(dc('tenant-option-management--add-existing')).click();
  await page.locator(dc('import-option--category')).fill(category);
  if (key) await page.locator(dc('import-option--key')).fill(key);
  await page.locator(dc('import-option--import')).click();
  await settleClock(page);
}

test.describe('Tenant Option Management', () => {
  test.beforeEach(async ({ mock }) => {
    await mock.reset();
  });

  test('opens the page via Settings → Options and lazily creates the plugin configuration', async ({
    page,
    visitApp,
    reviewScreenshot,
  }) => {
    const createConfig = page.waitForRequest(
      (r) =>
        r.method() === 'POST' &&
        path(r).endsWith('/inventory/managedObjects') &&
        r.postDataJSON()?.type === 'tenant_option_plugin_config'
    );

    await visitApp('', { language: 'en', waitFor: '#navigator' });
    await page.locator(`c8y-navigator-node ${selectors.navigatorNode.label('Settings')}`).click();
    await page.locator(`c8y-navigator-node ${selectors.navigatorNode.label('Options')}`).click();
    await settleClock(page);

    await expect(page).toHaveURL(new RegExp(ROUTE));
    expect((await createConfig).postDataJSON()).toEqual({
      type: 'tenant_option_plugin_config',
      options: [],
    });
    await expect(page.locator(dc('tenant-option-management--empty-state'))).toContainText(
      'No Tenant Option created or imported yet.'
    );
    // export is disabled without rows
    await expect(page.locator(dc('tenant-option-management--export'))).toBeDisabled();
    await reviewScreenshot('tenant-option-management/empty');
  });

  test('creates a new text tenant option', async ({ page, visitApp, reviewScreenshot }) => {
    const key = uniqueKey();

    await visitPlugin(page, visitApp);
    const created = page.waitForRequest(isOptionsPost);
    const configUpdate = page.waitForRequest(isConfigUpdate);

    await page.locator(dc('tenant-option-management--create')).click();
    await expect(page.locator(MODAL)).toBeVisible();
    await reviewScreenshot('tenant-option-management/create-modal');
    await page.locator(dc('add-option--category')).fill(CATEGORY);
    await page.locator(dc('add-option--key')).fill(key);
    await page.locator(dc('add-option--value')).fill('hello world');
    await page.locator(dc('add-option--save')).click();
    await settleClock(page);

    expect((await created).postDataJSON()).toMatchObject({
      category: CATEGORY,
      key,
      value: 'hello world',
    });
    const item = (
      (await configUpdate).postDataJSON().options as {
        category: string;
        key: string;
        user: string;
      }[]
    ).find((o) => o.key === key);

    expect(item).toMatchObject({ category: CATEGORY });
    expect(item?.user).toBeTruthy();

    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(rowByKey(page, key).locator(CONTENT_CELL)).toContainText('hello world');
    await expect(page.locator(dc('tenant-option-management--export'))).toBeEnabled();
    // the key is unique per run: mask the row's key cell
    await reviewScreenshot('tenant-option-management/list', {
      mask: [rowByKey(page, key).locator(KEY_CELL)],
    });
  });

  test('opens JSON values in the JSON editor tab when editing', async ({ page, api, visitApp }) => {
    const key = uniqueKey('json');

    await createTenantOption(api, CATEGORY, key, '{"a":1}');
    await visitPlugin(page, visitApp);

    // register the existing option, then edit it
    await addExisting(page, CATEGORY, key);
    await expect(page.locator(MODAL)).toHaveCount(0);

    await rowAction(page, key, 'edit');
    await expect(page.locator(dc('add-option--tab-json')).locator('xpath=..')).toHaveClass(
      /active/
    );
    await expect(page.locator(`${MODAL} mapping-json-editor`)).toBeVisible();
    await expect(page.locator(dc('add-option--value'))).toHaveCount(0);
    // switching tabs resets the value, so Save gets disabled until a value is entered
    await page.locator(dc('add-option--tab-text')).click();
    await expect(page.locator(dc('add-option--save'))).toBeDisabled();
    await page.locator(dc('add-option--value')).fill('plain');
    const updated = page.waitForRequest(isOptionPut(key));

    await page.locator(dc('add-option--save')).click();
    await settleClock(page);
    expect((await updated).postDataJSON()).toMatchObject({ value: 'plain' });
    await expect(rowByKey(page, key).locator(CONTENT_CELL)).toContainText('plain');
  });

  test('validates duplicate category/key combinations and shows API errors', async ({
    page,
    visitApp,
  }) => {
    const key = uniqueKey();

    await page.route(
      '**/tenant/options',
      (route) =>
        route.request().method() === 'POST'
          ? route.fulfill({ status: 409, json: { error: 'duplicate' } })
          : route.fallback(),
      { times: 1 }
    );
    await visitPlugin(page, visitApp);
    await createViaModal(page, CATEGORY, key, 'v');
    // the backend error is shown inside the modal, which stays open
    await expect(page.locator(dc('add-option--api-error'))).toBeVisible();
    await page.locator(dc('add-option--cancel')).click();
    await expect(page.locator(MODAL)).toHaveCount(0);

    // a key that is already in the grid triggers the client-side conflict check
    const key2 = uniqueKey();

    await createViaModal(page, CATEGORY, key2, 'first');
    await expect(rowByKey(page, key2)).toHaveCount(1);

    await page.locator(dc('tenant-option-management--create')).click();
    await page.locator(dc('add-option--category')).fill(CATEGORY);
    await page.locator(dc('add-option--key')).fill(key2);
    await page.locator(dc('add-option--value')).fill('second');
    await expect(page.locator(dc('add-option--conflict'))).toContainText(
      'Combination of Category and Key exists already.'
    );
    await expect(page.locator(dc('add-option--save'))).toBeDisabled();
    await page.locator(dc('add-option--cancel')).click();
  });

  test('edits the value of an existing tenant option', async ({ page, visitApp }) => {
    const key = uniqueKey();

    await visitPlugin(page, visitApp);
    await createViaModal(page, CATEGORY, key, 'before');
    await expect(rowByKey(page, key)).toHaveCount(1);

    await rowAction(page, key, 'edit');
    await expect(page.locator(MODAL)).toContainText('Update Tenant Option');
    await expect(page.locator(dc('add-option--category'))).toBeDisabled();
    await expect(page.locator(dc('add-option--category'))).toHaveValue(CATEGORY);
    await expect(page.locator(dc('add-option--key'))).toBeDisabled();
    await expect(page.locator(dc('add-option--key'))).toHaveValue(key);
    await expect(page.locator(dc('add-option--value'))).toHaveValue('before');
    await page.locator(dc('add-option--value')).fill('after');
    const updated = page.waitForRequest(isOptionPut(key));

    await page.locator(dc('add-option--save')).click();
    await settleClock(page);

    expect((await updated).postDataJSON()).toMatchObject({ value: 'after' });
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(rowByKey(page, key).locator(CONTENT_CELL)).toContainText('after');
  });

  test('deletes a tenant option after confirmation (cancel keeps it)', async ({
    page,
    api,
    visitApp,
  }) => {
    const key = uniqueKey();

    await visitPlugin(page, visitApp);
    await createViaModal(page, CATEGORY, key, 'to-delete');
    await expect(rowByKey(page, key)).toHaveCount(1);

    await rowAction(page, key, 'remove');
    await shell(page).confirmModal.cancel();
    await expect(rowByKey(page, key)).toHaveCount(1);

    const configUpdate = page.waitForRequest(isConfigUpdate);

    await rowAction(page, key, 'remove');
    await shell(page).confirmModal.confirm();
    await settleClock(page);

    const options = (await configUpdate).postDataJSON().options as { key: string }[];

    expect(options.map((o) => o.key)).not.toContain(key);
    await expect(page.locator(`${GRID} ${KEY_CELL}`).filter({ hasText: key })).toHaveCount(0);
    // the option itself is gone from the mock too
    expect((await api.get(`/tenant/options/${CATEGORY}/${key}`)).status()).toBe(404);
  });

  test('shows an error when deleting fails', async ({ page, visitApp }) => {
    const key = uniqueKey();

    await visitPlugin(page, visitApp);
    await createViaModal(page, CATEGORY, key, 'stay');
    await expect(rowByKey(page, key)).toHaveCount(1);

    await page.route(`**/tenant/options/${CATEGORY}/${key}`, (route) =>
      route.request().method() === 'DELETE'
        ? route.fulfill({ status: 500, json: { error: 'boom' } })
        : route.fallback()
    );
    await rowAction(page, key, 'remove');
    await shell(page).confirmModal.confirm();
    await settleClock(page);

    await expect(page.locator(ALERT_DANGER)).toContainText('Could not delete the tenant option.');
    await expect(rowByKey(page, key)).toHaveCount(1);
  });

  test('adds an existing tenant option to the managed list', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    const key = uniqueKey('existing');

    await createTenantOption(api, CATEGORY, key, 'pre-existing');
    await visitPlugin(page, visitApp);

    await page.locator(dc('tenant-option-management--add-existing')).click();
    await expect(page.locator(dc('import-option--import'))).toBeDisabled();
    await reviewScreenshot('tenant-option-management/import-modal');
    await page.locator(dc('import-option--category')).fill(CATEGORY);
    await page.locator(dc('import-option--key')).fill(key);
    const read = page.waitForResponse((r) =>
      path(r.request()).endsWith(`/tenant/options/${CATEGORY}/${key}`)
    );

    await page.locator(dc('import-option--import')).click();
    await settleClock(page);

    await read;
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(rowByKey(page, key).locator(CONTENT_CELL)).toContainText('pre-existing');
  });

  test('shows an error when adding a tenant option that does not exist', async ({
    page,
    visitApp,
  }) => {
    const key = uniqueKey('missing');

    await visitPlugin(page, visitApp);

    const read = page.waitForResponse((r) =>
      path(r.request()).endsWith(`/tenant/options/${CATEGORY}/${key}`)
    );

    await addExisting(page, CATEGORY, key);

    expect((await read).status()).toBe(404);
    await expect(page.locator(ALERT_DANGER)).toContainText('Option could not be imported');
    await page.locator(dc('import-option--cancel')).click();
    await expect(page.locator(MODAL)).toHaveCount(0);
  });

  test('adds all tenant options of a category when the key is left empty', async ({
    page,
    api,
    visitApp,
  }) => {
    const category = uniqueKey('bulk');
    const keyA = uniqueKey('a');
    const keyB = uniqueKey('b');

    await createTenantOption(api, category, keyA, 'value-a');
    await createTenantOption(api, category, keyB, 'value-b');
    // an option of another category must not be pulled in
    const foreignKey = uniqueKey('foreign');

    await createTenantOption(api, CATEGORY, foreignKey, 'foreign');
    await visitPlugin(page, visitApp);

    await page.locator(dc('tenant-option-management--add-existing')).click();
    await page.locator(dc('import-option--category')).fill(category);
    await expect(page.locator(dc('import-option--key'))).toHaveValue('');
    const configUpdate = page.waitForRequest(isConfigUpdate);

    await page.locator(dc('import-option--import')).click();
    await settleClock(page);

    const options = (await configUpdate).postDataJSON().options as {
      category: string;
      key: string;
    }[];

    expect(
      options
        .filter((o) => o.category === category)
        .map((o) => o.key)
        .sort()
    ).toEqual([keyA, keyB].sort());
    expect(options.some((o) => o.key === foreignKey)).toBe(false);
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator(ALERT_SUCCESS)).toContainText(
      `2 tenant options of category "${category}" were added.`
    );
    await expect(rowByKey(page, keyA).locator(CONTENT_CELL)).toContainText('value-a');
    await expect(rowByKey(page, keyB).locator(CONTENT_CELL)).toContainText('value-b');
    await expect(page.locator(`${GRID} ${KEY_CELL}`).filter({ hasText: foreignKey })).toHaveCount(
      0
    );
  });

  test('skips already managed options when importing a category again', async ({
    page,
    api,
    visitApp,
  }) => {
    const category = uniqueKey('bulkagain');
    const keyA = uniqueKey('a');
    const keyB = uniqueKey('b');

    await createTenantOption(api, category, keyA, 'value-a');
    await visitPlugin(page, visitApp);

    // first import: only A exists
    let configUpdate = page.waitForRequest(isConfigUpdate);

    await addExisting(page, category);
    await configUpdate;
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(rowByKey(page, keyA)).toHaveCount(1);

    // second import: B is new, A is already managed and must not be duplicated
    await createTenantOption(api, category, keyB, 'value-b');
    configUpdate = page.waitForRequest(isConfigUpdate);
    await addExisting(page, category);
    const keys = (
      (await configUpdate).postDataJSON().options as { category: string; key: string }[]
    )
      .filter((o) => o.category === category)
      .map((o) => o.key);

    expect(keys.sort()).toEqual([keyA, keyB].sort());
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator(ALERT_SUCCESS)).toContainText(
      `1 tenant options of category "${category}" were added.`
    );
    await expect(page.locator(`${GRID} ${KEY_CELL}`).filter({ hasText: keyA })).toHaveCount(1);
    await expect(rowByKey(page, keyB)).toHaveCount(1);

    // third import: nothing new — no write, informative message
    await addExisting(page, category);
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(page.locator(ALERT_SUCCESS)).toContainText(
      `All tenant options of category "${category}" are already managed.`
    );
    await expect(page.locator(`${GRID} ${KEY_CELL}`).filter({ hasText: keyA })).toHaveCount(1);
  });

  test('shows an error when a category has no options or listing fails', async ({
    page,
    visitApp,
  }) => {
    const category = uniqueKey('emptycat');

    await visitPlugin(page, visitApp);

    await addExisting(page, category);
    await expect(page.locator(ALERT_DANGER)).toContainText('Option could not be imported');
    await expect(page.locator(MODAL)).toBeVisible();

    await page.route('**/tenant/options?*', (route) =>
      route.fulfill({ status: 500, json: { error: 'boom' } })
    );
    const failed = page.waitForResponse(
      (r) => path(r.request()).endsWith('/tenant/options') && r.status() === 500
    );

    await page.locator(dc('import-option--import')).click();
    await settleClock(page);
    await failed;
    await expect(page.locator(ALERT_DANGER).first()).toBeVisible();
    await expect(page.locator(MODAL)).toBeVisible();
    await page.locator(dc('import-option--cancel')).click();
    await expect(page.locator(MODAL)).toHaveCount(0);
  });

  test('exports selected tenant options to a JSON file', async ({ page, visitApp }) => {
    const key = uniqueKey('export');

    await visitPlugin(page, visitApp);
    await createViaModal(page, CATEGORY, key, 'exported-value');
    await expect(rowByKey(page, key)).toHaveCount(1);

    await page.locator(dc('tenant-option-management--export')).click();
    await settleClock(page);
    await expect(page.locator(MODAL)).toContainText('Export Tenant Option');
    await modalRow(page, key).locator(CHECKBOX).check({ force: true });
    const download = page.waitForEvent('download');

    await page.locator(dc('export-option--export')).click();

    await expect(page.locator(MODAL)).toHaveCount(0);
    const file = await download;

    expect(file.suggestedFilename()).toBe('export_tenant_options.json');
    expect(JSON.parse(readFileSync(await file.path(), 'utf8'))).toEqual([
      { category: CATEGORY, key, value: 'exported-value' },
    ]);
  });

  test('imports new and conflicting tenant options from a JSON file', async ({
    page,
    api,
    visitApp,
  }) => {
    const existingKey = uniqueKey('conflict');
    const newKey = uniqueKey('new');

    await createTenantOption(api, CATEGORY, existingKey, 'old');
    await visitPlugin(page, visitApp);

    await page.locator(dc('tenant-option-management--import')).click();
    await page.locator(dc('file-import--file')).setInputFiles({
      name: 'options.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify([
          { category: CATEGORY, key: newKey, value: 'new-value' },
          { category: CATEGORY, key: existingKey, value: 'overwritten' },
        ])
      ),
    });
    await settleClock(page);

    await expect(modalRow(page, newKey)).toContainText('NEW');
    await expect(modalRow(page, existingKey)).toContainText('CONFLICT');

    await modalRow(page, newKey).locator(CHECKBOX).check({ force: true });
    await modalRow(page, existingKey).locator(CHECKBOX).check({ force: true });
    // selecting a conflicting entry asks for overwrite confirmation
    await shell(page).confirmModal.confirm();
    await settleClock(page);
    await expect(modalRow(page, existingKey)).toContainText('OVERWRITE');

    const created = page.waitForRequest(isOptionsPost);
    const updated = page.waitForRequest(isOptionPut(existingKey));

    await page.locator(dc('file-import--import')).click();
    await settleClock(page);
    expect((await created).postDataJSON()).toMatchObject({
      category: CATEGORY,
      key: newKey,
      value: 'new-value',
    });
    expect((await updated).postDataJSON()).toMatchObject({ value: 'overwritten' });

    await expect(page.locator(ALERT_SUCCESS)).toContainText(
      'Tenant options imported successfully.'
    );
    await expect(page.locator(MODAL)).toHaveCount(0);
    await expect(rowByKey(page, newKey).locator(CONTENT_CELL)).toContainText('new-value');
    await expect(rowByKey(page, existingKey).locator(CONTENT_CELL)).toContainText('overwritten');
  });

  test('imports the other options when one fails and reports the failed one', async ({
    page,
    visitApp,
  }) => {
    const failingKey = uniqueKey('forbidden');
    const okKey = uniqueKey('ok');

    await page.route('**/tenant/options', (route) =>
      route.request().method() === 'POST' && route.request().postDataJSON()?.key === failingKey
        ? route.fulfill({
            status: 403,
            json: { error: 'security/Forbidden', message: 'Access is denied' },
          })
        : route.fallback()
    );
    await visitPlugin(page, visitApp);

    await page.locator(dc('tenant-option-management--import')).click();
    await page.locator(dc('file-import--file')).setInputFiles({
      name: 'options.json',
      mimeType: 'application/json',
      buffer: Buffer.from(
        JSON.stringify([
          { category: CATEGORY, key: failingKey, value: 'a' },
          { category: CATEGORY, key: okKey, value: 'b' },
        ])
      ),
    });
    await settleClock(page);
    await expect(modalRow(page, failingKey)).toContainText('NEW');
    await expect(modalRow(page, okKey)).toContainText('NEW');
    await modalRow(page, failingKey).locator(CHECKBOX).check({ force: true });
    await modalRow(page, okKey).locator(CHECKBOX).check({ force: true });

    await page.locator(dc('file-import--import')).click();
    await settleClock(page);

    await expect(page.locator(ALERT_DANGER)).toContainText(
      '1 of 2 tenant options could not be imported.'
    );
    // the dialog stays open and shows which option failed; the import can be repeated
    await expect(modalRow(page, failingKey)).toContainText('FAILED');
    await expect(modalRow(page, okKey)).toContainText('ADDED');
    await expect(page.locator(dc('file-import--import'))).toBeEnabled();
    await expect(page.locator(dc('file-import--import'))).not.toHaveClass(/btn-pending/);
    await page.locator(dc('file-import--cancel')).click();
    await settleClock(page);
    await expect(rowByKey(page, okKey).locator(CONTENT_CELL)).toContainText('b');
  });

  test('rejects invalid import files and empty selections', async ({ page, visitApp }) => {
    await visitPlugin(page, visitApp);
    await page.locator(dc('tenant-option-management--import')).click();
    const file = page.locator(dc('file-import--file'));

    await file.setInputFiles({
      name: 'x.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"not":"an array"}'),
    });
    await expect(page.locator(ALERT_DANGER)).toContainText(
      'Invalid file content. Please select a valid JSON file.'
    );

    await file.setInputFiles({
      name: 'x.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('hello'),
    });
    await expect(
      page
        .locator(ALERT_DANGER)
        .filter({ hasText: 'Invalid file type. Please select a JSON file.' })
    ).toBeVisible();

    await page.locator(dc('file-import--import')).click();
    await settleClock(page);
    await expect(
      page.locator(ALERT_DANGER).filter({ hasText: 'Please select at least one item to import.' })
    ).toBeVisible();
    await page.locator(dc('file-import--cancel')).click();
    await expect(page.locator(MODAL)).toHaveCount(0);
  });
});
