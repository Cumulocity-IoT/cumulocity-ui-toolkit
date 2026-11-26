import { expect, test } from './support/fixtures';
import {
  NAV_NODE,
  DRAWER,
  ROW,
  FILTER,
  SETTINGS,
  SETTINGS_OPEN,
  SETTINGS_DONE,
  TRIGGER,
  openDrawer,
  openSettings,
} from './support/navigation-and-search';
import type { Page, Request } from '@playwright/test';

/**
 * The settings bottom drawer (cog next to the pin in the explorer drawer), General tab, on the
 * tenant mock. Converted from cypress/e2e/navigation-and-search-settings.cy.ts. The "Detail fields
 * by level" tab is covered in `navigation-and-search-detail.spec.ts`.
 *
 * Settings are stored on the user (`customProperties.ps_AssetNavigatorSettings`) — the mock
 * keeps them for the run, so every test starts from a reset world. SSO users get a managed
 * object of their own instead; the mock cannot log in through an identity provider, so that
 * test marks the current user as an SSO user (`customProperties.userOrigin = OAUTH2`).
 */

const CLOSE = '[data-cy="navigation-and-search--close"]';
const QUICK = '[data-cy="navigation-and-search--quick-access"]';
const COUNTS = '[data-cy="navigation-and-search--quick-access-counts"]';
const SHORTCUT = '[data-cy="navigation-and-search--setting-shortcut"]';
const FACET = '[data-cy="asset-search--facet"]';

const setting = (name: string) => `[data-cy="navigation-and-search--setting-${name}"]`;

/**
 * The next settings write (only those: the tree also stores recents and the drawer's pin/width on
 * the user). Register it before the action that triggers it.
 */
function nextSettingsWrite(page: Page): Promise<Request> {
  return page.waitForRequest(
    (r) =>
      r.method() === 'PUT' &&
      new URL(r.url()).pathname.endsWith('/user/currentUser') &&
      r.postDataJSON()?.customProperties?.['ps_AssetNavigatorSettings'] !== undefined
  );
}

/** The stored settings, as the awaited user update sent them. */
async function savedSettings(write: Promise<Request>) {
  return (await write).postDataJSON().customProperties.ps_AssetNavigatorSettings;
}

/** The settings checkboxes are styled: the native input has no box, so the click is dispatched to it. */
async function setChecked(page: Page, selector: string, checked: boolean) {
  const box = page.locator(selector);

  if ((await box.isChecked()) !== checked) await box.dispatchEvent('click');
  await expect(box).toBeChecked({ checked });
}

/** Open the first `n` hierarchy rows' assets, so they become recent entries. */
async function visitAssets(page: Page, n: number) {
  for (let i = 0; i < n; i++) {
    await page.locator(ROW).nth(i).locator('[data-cy="navigation-and-search--row-name"]').click();
    await expect(page).toHaveURL(/#\/group\//);
  }
}

/** Reopens the drawer after a reload. */
async function reopenDrawer(page: Page) {
  await page.reload();
  await page.locator(NAV_NODE).click({ timeout: 60_000 });
  await expect(page.locator(ROW).first()).toBeVisible({ timeout: 30_000 });
}

test.describe('Navigation and search — settings drawer', () => {
  test.beforeEach(async ({ mock }) => {
    await mock.reset();
  });

  test('opens from the cog as a bottom drawer; Done and Esc close it, the tree stays open', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    await expect(page.locator(SETTINGS_OPEN)).toHaveAttribute(
      'title',
      'Navigation and search settings'
    );
    await openSettings(page);
    await expect(page.locator('#drawerTitle')).toHaveText('Navigation and search settings');
    await expect(page.locator(SETTINGS_OPEN)).toHaveClass(/active/);
    // a second click does not stack a second drawer (the settings drawer may cover the cog)
    await page.locator(SETTINGS_OPEN).dispatchEvent('click');
    await expect(page.locator(SETTINGS)).toHaveCount(1);

    await page.locator(SETTINGS_DONE).click();
    await expect(page.locator(SETTINGS)).toHaveCount(0);
    await expect(page.locator(DRAWER)).toBeVisible();
    await expect(page.locator(SETTINGS_OPEN)).not.toHaveClass(/active/);

    await openSettings(page);
    await page.keyboard.press('Escape');
    await expect(page.locator(SETTINGS)).toHaveCount(0);
    await expect(page.locator(DRAWER)).toBeVisible();
  });

  test('opens on the General tab with the defaults, inventory fallback checked', async ({
    page,
    visitApp,
    reviewScreenshot,
  }) => {
    await openDrawer(page, visitApp);
    await openSettings(page);
    await expect(
      page.locator('[data-cy="navigation-and-search--settings-tab-general"]')
    ).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator(setting('search'))).toBeChecked();
    await expect(page.locator(setting('quick-access'))).toBeChecked();
    await expect(page.locator(setting('inventory-fallback'))).toBeChecked();
    await expect(page.locator(setting('max-pinned'))).toHaveValue('10');
    await expect(page.locator(setting('max-recent'))).toHaveValue('8');
    await expect(page.locator(SHORTCUT)).toHaveValue('None');
    // the global search chord is a tenant option: shown, read-only
    await expect(page.locator(setting('search-shortcut'))).toHaveAttribute('readonly', /.*/);
    await expect(page.locator(setting('search-shortcut'))).toHaveValue(/\+K$/);
    await expect(page.locator(setting('storage'))).toContainText('Stored with your user');
    await reviewScreenshot('navigation-and-search/settings-drawer');
  });

  test('hides the search, stores it on the user and keeps it after a reload', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    await expect(page.locator(FILTER)).toBeVisible();
    await page.locator(FILTER).fill('xyz');
    await openSettings(page);
    const write = nextSettingsWrite(page);

    await setChecked(page, setting('search'), false);
    expect(await savedSettings(write)).toMatchObject({ showSearch: false });
    await expect(page.locator(FILTER)).toHaveCount(0);
    // hiding the search drops the filter it held: the whole tree is back
    await expect.poll(() => page.locator(ROW).count()).toBeGreaterThan(1);

    await reopenDrawer(page);
    await expect(page.locator(FILTER)).toHaveCount(0);
    // typing on the tree no longer filters invisibly
    const tree = page.locator(`${DRAWER} [role="tree"][aria-label="Asset hierarchy"]`);

    await tree.focus();
    await tree.press('q');
    await expect.poll(() => page.locator(ROW).count()).toBeGreaterThan(1);
  });

  test('hides and shows "Pinned & Recent"', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);
    await expect(page.locator(QUICK)).toBeVisible();
    await openSettings(page);
    let write = nextSettingsWrite(page);

    await setChecked(page, setting('quick-access'), false);
    expect(await savedSettings(write)).toMatchObject({ showQuickAccess: false });
    await expect(page.locator(QUICK)).toBeHidden();
    await expect(page.locator(setting('max-recent'))).toBeDisabled();
    write = nextSettingsWrite(page);
    await setChecked(page, setting('quick-access'), true);
    expect(await savedSettings(write)).toMatchObject({ showQuickAccess: true });
    await page.locator(SETTINGS_DONE).click();
    await expect(page.locator(SETTINGS)).toHaveCount(0);
    await expect(page.locator(QUICK)).toBeVisible();
  });

  test('limits the recent entries to the configured count', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);
    await visitAssets(page, 3);
    await expect(page.locator(COUNTS)).toHaveText(/^\s*0\+[2-9]\s*$/);
    await openSettings(page);
    const write = nextSettingsWrite(page);
    const maxRecent = page.locator(setting('max-recent'));

    await maxRecent.fill('1');
    await maxRecent.blur();
    expect(await savedSettings(write)).toMatchObject({ maxRecent: 1 });
    await expect(page.locator(COUNTS)).toHaveText(/^\s*0\+1\s*$/);
  });

  test('records a keyboard shortcut that opens and closes the drawer', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    await openSettings(page);
    const shortcut = page.locator(SHORTCUT);

    await shortcut.click();
    await expect(shortcut).toHaveValue('Press a key combination…');
    // a bare key is not accepted (it would fire while typing)
    await shortcut.press('x');
    await expect(shortcut).toHaveValue('Press a key combination…');
    let write = nextSettingsWrite(page);

    await shortcut.press('Shift+Alt+T');
    expect(await savedSettings(write)).toMatchObject({ shortcut: 'shift+alt+t' });
    await expect(shortcut).toHaveValue('Shift+Alt+T');

    // the settings drawer covers the close button: the click is dispatched to it
    await page.locator(CLOSE).dispatchEvent('click');
    await expect(page.locator(DRAWER)).toHaveCount(0);
    await page.keyboard.press('Shift+Alt+T');
    await expect(page.locator(DRAWER)).toBeVisible();
    await page.keyboard.press('Shift+Alt+T');
    await expect(page.locator(DRAWER)).toHaveCount(0);

    // removed again: the chord does nothing
    await page.locator(NAV_NODE).click();
    await openSettings(page);
    write = nextSettingsWrite(page);
    await page.locator(setting('shortcut-clear')).click();
    expect(await savedSettings(write)).toMatchObject({ shortcut: '' });
    await expect(shortcut).toHaveValue('None');
    await page.locator(CLOSE).dispatchEvent('click');
    await expect(page.locator(DRAWER)).toHaveCount(0);
    await page.keyboard.press('Shift+Alt+T');
    await expect(page.locator(DRAWER)).toHaveCount(0);
  });

  test('falls back to the inventory for type filters when DTM is unavailable — and not when turned off', async ({
    page,
    visitApp,
  }) => {
    // The mock has no DTM microservice (404), as a tenant without the subscription.
    await openDrawer(page, visitApp);
    await page.locator(CLOSE).dispatchEvent('click');
    await page.locator(TRIGGER).click();
    await expect(page.locator(FACET).first()).toBeVisible();
    await expect(page.locator(FACET).filter({ hasText: 'Wind turbine' })).not.toHaveCount(0);

    await page.reload();
    await page.locator(NAV_NODE).click({ timeout: 60_000 });
    await expect(page.locator(DRAWER)).toBeVisible();
    await openSettings(page);
    const write = nextSettingsWrite(page);

    await setChecked(page, setting('inventory-fallback'), false);
    expect(await savedSettings(write)).toMatchObject({ inventoryFallback: false });

    await page.reload();
    await page.locator(TRIGGER).click({ timeout: 60_000 });
    await expect(page.locator('[data-cy="asset-search--input"]')).toBeFocused();
    await expect(page.locator(FACET)).toHaveCount(0);
  });

  test("stores an SSO user's settings in a managed object of their own, not on the user", async ({
    page,
    api,
    visitApp,
  }) => {
    // SSO users carry `customProperties.userOrigin = OAUTH2` (the platform's own test); the mock
    // cannot log in through an identity provider, so the current user is marked as one.
    await page.route(
      (url) => url.pathname.endsWith('/user/currentUser'),
      async (route) => {
        if (route.request().method() !== 'GET') return route.fallback();
        const response = await route.fetch();
        const body = await response.json();

        body.customProperties = { ...(body.customProperties ?? {}), userOrigin: 'OAUTH2' };
        await route.fulfill({ response, json: body });
      }
    );
    await openDrawer(page, visitApp);
    await openSettings(page);
    await expect(page.locator(setting('storage'))).toContainText('single sign-on');
    const createSettings = page.waitForRequest(
      (r) =>
        r.method() === 'POST' &&
        new URL(r.url()).pathname.endsWith('/inventory/managedObjects') &&
        r.postDataJSON()?.type === 'ps_AssetNavigatorSettings'
    );

    await setChecked(page, setting('search'), false);
    expect((await createSettings).postDataJSON().ps_AssetNavigatorSettings).toMatchObject({
      showSearch: false,
    });
    // nothing of it on the user object
    const user = await (await api.get('/user/currentUser')).json();

    expect(user.customProperties?.ps_AssetNavigatorSettings).toBeUndefined();
    await expect
      .poll(
        async () =>
          (
            await (
              await api.get('/inventory/managedObjects?type=ps_AssetNavigatorSettings&pageSize=10')
            ).json()
          ).managedObjects.length
      )
      .toBe(1);
    await reopenDrawer(page);
    await expect(page.locator(FILTER)).toHaveCount(0);
  });

  test('resets everything to the defaults', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);
    await openSettings(page);
    let write = nextSettingsWrite(page);

    await setChecked(page, setting('search'), false);
    await write;
    write = nextSettingsWrite(page);
    await page.locator(setting('reset')).click();
    const { detailPanel, rollups, treeFilter, ...rest } = await savedSettings(write);

    expect(rest).toEqual({
      showSearch: true,
      shortcut: '',
      showQuickAccess: true,
      maxPinned: 10,
      maxRecent: 8,
      inventoryFallback: true,
    });
    // the detail panel's data contract, at its defaults
    expect(detailPanel.version).toBe(1);
    expect(detailPanel.types).toEqual({});
    expect(detailPanel.default).toHaveLength(7);
    expect(rollups.types).toEqual({});
    expect(rollups.default.badge).toBe('count:units');
    expect(rollups.dotSeverities).toEqual(['critical', 'major', 'minor', 'warning']);
    expect(treeFilter).toEqual({ version: 1, enabled: true, conditions: [], hideEmpty: true });
    await page.locator(SETTINGS_DONE).click();
    await expect(page.locator(FILTER)).toBeVisible();
  });

  test('narrows the tree with a permanent filter, says so above the tree, and turns it off from there', async ({
    page,
    visitApp,
  }) => {
    const count = async () =>
      parseInt(
        await page.locator('[data-cy="navigation-and-search--footer-count"]').innerText(),
        10
      );
    const tab = page.locator('[data-cy="navigation-and-search--settings-tab-filter"]');
    const result = page.locator('[data-cy="navigation-and-search--treefilter-result"]');

    await openDrawer(page, visitApp);
    const before = await count();

    await openSettings(page);
    await tab.click();
    await expect(result).toContainText('The tree shows all');
    // the second level, with at least a critical alarm somewhere below
    let write = nextSettingsWrite(page);

    await page.locator('[data-cy="navigation-and-search--treefilter-add"]').click();
    await write;
    write = nextSettingsWrite(page);
    await page
      .locator('[data-cy="navigation-and-search--treefilter-severity"]')
      .selectOption('critical');
    const { conditions } = (await savedSettings(write)).treeFilter;

    expect(conditions).toHaveLength(1);
    expect(conditions[0].test).toEqual({ kind: 'alarms', atLeast: 'critical' });
    await expect(result).toHaveText(/Hides [1-9]\d* of \d+ assets/);
    await expect(tab.locator('.badge')).toHaveText('1');

    await page.locator(SETTINGS_DONE).click();
    // gone, not just closing: the next drawer must not meet the old one's closing animation
    await expect(page.locator(SETTINGS)).toHaveCount(0);
    await expect(page.locator('[data-cy="navigation-and-search--filter-active"]')).toContainText(
      'assets hidden'
    );
    // the footer counts what the filtered tree holds
    await expect.poll(count).toBeLessThan(before);

    // "Edit" opens the settings on the filter tab
    await page.locator('[data-cy="navigation-and-search--filter-edit"]').click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await page.locator(SETTINGS_DONE).click();
    await expect(page.locator(SETTINGS)).toHaveCount(0);

    // the bar's ✕ keeps the conditions and shows everything again
    write = nextSettingsWrite(page);
    await page.locator('[data-cy="navigation-and-search--filter-off"]').click();
    const { treeFilter } = await savedSettings(write);

    expect(treeFilter.enabled).toBe(false);
    expect(treeFilter.conditions).toHaveLength(1);
    await expect(page.locator('[data-cy="navigation-and-search--filter-active"]')).toHaveCount(0);
    await expect.poll(count).toBe(before);
  });

  test('colours the status dot by the chosen severities only', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);
    await openSettings(page);
    let write = nextSettingsWrite(page);

    await setChecked(page, setting('dot-minor'), false);
    await write;
    write = nextSettingsWrite(page);
    await setChecked(page, setting('dot-warning'), false);
    expect((await savedSettings(write)).rollups.dotSeverities).toEqual(['critical', 'major']);
    await page.locator(SETTINGS_DONE).click();
    await expect(
      page.locator(`${ROW} .ps-status-dot--minor, ${ROW} .ps-status-dot--warning`)
    ).toHaveCount(0);
  });
});
