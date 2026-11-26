import { expect, test } from './support/fixtures';
import { selectors } from './selectors';
import type { Page } from '@playwright/test';

/**
 * Index DB Cache e2e — runs against the tenant mock (windy-dev world) inside the cockpit shell.
 * Converted from cypress/e2e/index-db-cache-plugin.cy.ts.
 *
 * Features:
 *  - action-bar toggle (on every route) opening / closing the cache drawer
 *  - "Caching active" switch, persisted in localStorage (`c8y-idb-cache-active`, default on)
 *  - "Cancel requests on navigation" switch, persisted (`c8y-idb-abort-on-navigation`, default off)
 *  - statistics table (3 caches) + "Clear all caches"
 *  - live log (empty state, clear log)
 *
 * Not covered: the HTTP interceptors filling the cache. They only act on measurement list / series requests
 * issued through the ngx ApiService (e.g. by chart widgets on a dashboard); the mock world has no dashboards and
 * cockpit issues no such request on its own, so there is no stable UI path to trigger them. Their logic is
 * unit-tested.
 */

const TOGGLE = '[data-cy="index-db-cache--toggle"]';
const DRAWER = '#collapseCache';
const ACTIVE_TOGGLE = '[data-cy="index-db-cache--active-toggle"]';
const ABORT_TOGGLE = '[data-cy="index-db-cache--abort-toggle"]';
const ACTIVE_STATE = '[data-cy="index-db-cache--active-state"]';
const NAVIGATOR_BUTTON = selectors.headerBar.mainHeaderButton;
const NAVIGATOR = '.app-main-navigator, c8y-navigator, .navigator';
const VISIT = { language: 'en', waitFor: TOGGLE, timeout: 60_000 };

type VisitApp = (
  path?: string,
  options?: { language?: string; waitFor?: string; timeout?: number }
) => Promise<void>;

async function openDrawer(page: Page, visitApp: VisitApp, path = '') {
  await visitApp(path, VISIT);
  await page.locator(TOGGLE).click();
  await expect(page.locator(DRAWER)).toBeVisible();
}

/** Reload, then open the drawer again (a shell alert after the reload can cover the toggle: dispatched click). */
async function reloadAndOpen(page: Page) {
  await page.reload();
  await expect(page.locator(TOGGLE)).toBeVisible({ timeout: 60_000 });
  await page.locator(TOGGLE).dispatchEvent('click');
  await expect(page.locator(DRAWER)).toBeVisible();
}

const localStorageItem = (page: Page, key: string) =>
  page.evaluate((k) => localStorage.getItem(k), key);

const bottomOfToolbar = (page: Page) =>
  page.evaluate(() =>
    Math.max(
      ...Array.from(document.querySelectorAll('c8y-action-bar, .c8y-ui-action-bar'))
        .map((el) => el.getBoundingClientRect())
        .filter((box) => box.height > 0)
        .map((box) => box.bottom)
    )
  );
const navigatorRight = (page: Page) =>
  page.evaluate(
    (selector) => Math.max(0, document.querySelector(selector)!.getBoundingClientRect().right),
    NAVIGATOR
  );
const drawerBox = (page: Page) => page.locator(DRAWER).evaluate((el) => el.getBoundingClientRect());

test.describe('Index DB Cache Plugin', () => {
  test.beforeAll(async ({ mock }) => {
    await mock.reset();
  });

  // Every test runs in a fresh browser context: localStorage starts empty, as cy.clearLocalStorage() did.

  test('shows the cache action bar button and opens / closes the drawer', async ({
    page,
    visitApp,
  }) => {
    await visitApp('', { language: 'en', waitFor: '#navigator', timeout: 60_000 });

    await expect(page.locator(DRAWER)).toBeHidden();
    const toggle = page.locator(TOGGLE);

    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await toggle.click();

    await expect(page.locator(DRAWER)).toBeVisible();
    await expect(page.locator(DRAWER)).toContainText('IndexedDB Cache');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const close = page.locator('[data-cy="index-db-cache--close"]');

    await expect(close).toBeVisible();
    await close.click();
    await expect(page.locator(DRAWER)).toBeHidden();
  });

  test('places the drawer below the page toolbar and right of the navigator, following it', async ({
    page,
    visitApp,
  }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await visitApp('', VISIT);
    // the shell may start with the navigator closed; open it so there is an edge to follow
    if ((await navigatorRight(page)) < 100) await page.locator(NAVIGATOR_BUTTON).click();
    await expect.poll(() => navigatorRight(page)).toBeGreaterThan(100);
    await page.locator(TOGGLE).click();

    await expect
      .poll(async () => {
        const box = await drawerBox(page);
        return [
          Math.abs(box.top - (await bottomOfToolbar(page))) <= 1,
          Math.abs(box.left - (await navigatorRight(page))) <= 1,
        ];
      })
      .toEqual([true, true]);

    // a collapsed rail (as with the asset navigator): narrower, no fixed offsets assumed
    await page
      .locator(NAVIGATOR)
      .first()
      .evaluate((el) => ((el as HTMLElement).style.width = '64px'));
    await expect
      .poll(async () => Math.abs((await drawerBox(page)).left - (await navigatorRight(page))))
      .toBeLessThanOrEqual(1);
    await page
      .locator(NAVIGATOR)
      .first()
      .evaluate((el) => ((el as HTMLElement).style.width = ''));

    // closed with the shell's own toggle: the drawer moves to the page's left edge
    await page.locator(NAVIGATOR_BUTTON).click();
    await expect.poll(() => navigatorRight(page)).toBe(0);
    await expect
      .poll(async () => Math.abs((await drawerBox(page)).left - (await navigatorRight(page))))
      .toBeLessThanOrEqual(1);
  });

  test('is available on device pages as well', async ({ page, api, visitApp }) => {
    const res = await api.get('/inventory/managedObjects?fragmentType=c8y_IsDevice&pageSize=1');
    const id = (await res.json()).managedObjects[0].id as string;

    await openDrawer(page, visitApp, `device/${id}`);
  });

  test('toggles caching and persists the state in localStorage', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);

    // default: caching active
    await expect(page.locator(ACTIVE_TOGGLE)).toBeChecked();
    await expect(page.locator(ACTIVE_STATE)).toContainText('Caching active');

    await page.locator(ACTIVE_TOGGLE).click({ force: true });
    await expect(page.locator(ACTIVE_STATE)).toContainText('Caching disabled');
    expect(await localStorageItem(page, 'c8y-idb-cache-active')).toBe('false');

    // survives a reload
    await reloadAndOpen(page);
    await expect(page.locator(ACTIVE_TOGGLE)).not.toBeChecked();
    await expect(page.locator(ACTIVE_STATE)).toContainText('Caching disabled');

    await page.locator(ACTIVE_TOGGLE).click({ force: true });
    await expect(page.locator(ACTIVE_STATE)).toContainText('Caching active');
    expect(await localStorageItem(page, 'c8y-idb-cache-active')).toBe('true');
  });

  test('toggles cancelling requests on navigation and persists it', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);

    // default: disabled
    await expect(page.locator(ABORT_TOGGLE)).not.toBeChecked();
    await page.locator(ABORT_TOGGLE).click({ force: true });
    await expect(page.locator(ABORT_TOGGLE)).toBeChecked();
    expect(await localStorageItem(page, 'c8y-idb-abort-on-navigation')).toBe('true');

    await reloadAndOpen(page);
    await expect(page.locator(ABORT_TOGGLE)).toBeChecked();
    await page.locator(ABORT_TOGGLE).click({ force: true });
    await expect(page.locator(ABORT_TOGGLE)).not.toBeChecked();
    expect(await localStorageItem(page, 'c8y-idb-abort-on-navigation')).toBe('false');
  });

  test('shows cache statistics and clears all caches', async ({
    page,
    visitApp,
    reviewScreenshot,
  }) => {
    await openDrawer(page, visitApp);

    const rows = page.locator('[data-cy="index-db-cache--stats-row"]');

    await expect(rows).toHaveCount(3);
    const stats = page.locator('[data-cy="index-db-cache--stats"]');

    await expect(stats).toContainText('New Series');
    await expect(stats).toContainText('Old Series');
    await expect(stats).toContainText('Measurements');
    await reviewScreenshot('index-db-cache/drawer');

    const clearAll = page.locator('[data-cy="index-db-cache--clear-all"]');

    await expect(clearAll).toBeEnabled();
    await clearAll.click();
    await expect(clearAll).toBeEnabled();

    for (const row of await rows.all()) {
      await expect(row.locator('td').last()).toHaveText('0');
    }
  });

  test('shows the empty live log and can clear it', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);

    // the log sits at the bottom of the fixed drawer, partly below the viewport
    const empty = page.locator('[data-cy="index-db-cache--log-empty"]');

    await expect(empty).toBeAttached();
    await expect(empty).toContainText('No intercepted requests yet.');
    await page.locator('[data-cy="index-db-cache--clear-log"]').dispatchEvent('click');
    await expect(page.locator('[data-cy="index-db-cache--log-entry"]')).toHaveCount(0);
    await expect(empty).toBeAttached();
  });
});
