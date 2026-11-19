import { expect, test } from '@cumulocity-iot/ui-sdk/playwright';
import type { APIRequestContext, Page } from '@playwright/test';

/**
 * Favorites Manager e2e — runs against the tenant mock (windy-dev world).
 * Converted from cypress/e2e/favorites-manager-plugin.cy.ts. The Cypress spec rewrote GET /user/currentUser
 * responses to fake the favorites; here they are stored on the mock (PUT /user/currentUser), reset per test.
 */

const ACTION_BUTTON = '[data-cy="favorites-action-button"]';
const NAV_NODE = 'c8y-navigator-node button[data-cy="favorites.title"]';

interface MO {
  id: string;
  name: string;
}

async function firstOf(api: APIRequestContext, fragment: string): Promise<MO> {
  const res = await api.get(`/inventory/managedObjects?fragmentType=${fragment}&pageSize=1`);
  return (await res.json()).managedObjects[0] as MO;
}

async function setFavorites(api: APIRequestContext, favorites: string[]): Promise<void> {
  await api.put('/user/currentUser', { data: { customProperties: { favorites } } });
}

async function storedFavorites(api: APIRequestContext): Promise<string[]> {
  return (await (await api.get('/user/currentUser')).json()).customProperties?.favorites ?? [];
}

const actionButton = (page: Page) => page.locator(ACTION_BUTTON);

test.describe('Favorites Manager', () => {
  let device: MO;
  let group: MO;

  test.beforeAll(async ({ mock, api }) => {
    await mock.reset();
    device = await firstOf(api, 'c8y_IsDevice');
    group = await firstOf(api, 'c8y_IsDeviceGroup');
  });

  test.beforeEach(async ({ mock }) => {
    await mock.reset();
  });

  test('opens the favorites list from the navigator and shows the empty state', async ({
    page,
    api,
    visitApp,
  }) => {
    await setFavorites(api, []);
    await visitApp('', { language: 'en', waitFor: '#navigator' });

    await page.locator(NAV_NODE).filter({ hasText: 'Favorites' }).click({ timeout: 60_000 });

    await expect(page).toHaveURL(/#\/favorites/);
    await expect(page.locator('c8y-favorites-manager')).toBeVisible();
    await expect(page.locator('[data-cy="favorites-empty-state"]')).toContainText(
      'No favorites to display.'
    );
  });

  test('lists the favorites of the current user in the grid', async ({ page, api, visitApp }) => {
    await setFavorites(api, [device.id, group.id]);
    const favoritesQuery = page.waitForRequest(
      (r) =>
        r.url().includes('/inventory/managedObjects?') &&
        decodeURIComponent(r.url()).includes('id eq') &&
        r.url().includes('withParents=true')
    );

    await visitApp('favorites', { language: 'en', waitFor: 'c8y-favorites-manager' });

    const url = decodeURIComponent((await favoritesQuery).url());

    expect(url).toContain(device.id);
    expect(url).toContain(group.id);
    const names = page.locator('td[data-cy="data-grid--Name"]');

    await expect(names).toHaveCount(2);
    await expect(names.filter({ hasText: device.name })).toHaveCount(1);
    await expect(names.filter({ hasText: group.name })).toHaveCount(1);
    await expect(page.locator('[data-cy="favorites-empty-state"]')).toHaveCount(0);
  });

  test('adds a device to favorites from the action bar and removes it again', async ({
    page,
    api,
    visitApp,
  }) => {
    await setFavorites(api, []);
    await visitApp(`device/${device.id}`, {
      language: 'en',
      waitFor: ACTION_BUTTON,
      timeout: 60_000,
    });
    await expect(actionButton(page)).toContainText('Add to favorites');
    await expect(actionButton(page).locator('i.dlt-c8y-icon-star-outline')).toHaveCount(1);

    await actionButton(page).click();
    await expect.poll(() => storedFavorites(api)).toEqual([device.id]);
    await expect(actionButton(page)).toContainText('Remove from favorites');
    await expect(actionButton(page).locator('i.dlt-c8y-icon-star')).toHaveCount(1);

    await actionButton(page).click();
    await expect.poll(() => storedFavorites(api)).toEqual([]);
    await expect(actionButton(page)).toContainText('Add to favorites');
  });

  test('shows the favorite state of an already favorited group', async ({
    page,
    api,
    visitApp,
  }) => {
    await setFavorites(api, [group.id]);

    await visitApp(`group/${group.id}`, {
      language: 'en',
      waitFor: ACTION_BUTTON,
      timeout: 60_000,
    });
    await expect(actionButton(page)).toContainText('Remove from favorites');
    await expect(actionButton(page).locator('i.dlt-c8y-icon-star')).toHaveCount(1);
  });

  test('shows an error alert and keeps the state when saving fails', async ({
    page,
    api,
    visitApp,
  }) => {
    await setFavorites(api, []);
    await page.route('**/user/currentUser*', (route) =>
      route.request().method() === 'PUT'
        ? route.fulfill({ status: 500, json: {} })
        : route.fallback()
    );

    await visitApp(`device/${device.id}`, {
      language: 'en',
      waitFor: ACTION_BUTTON,
      timeout: 60_000,
    });
    const failed = page.waitForResponse(
      (r) => r.url().includes('/user/currentUser') && r.request().method() === 'PUT'
    );

    await actionButton(page).click();
    await failed;

    await expect(page.locator('c8y-alert-outlet .alert-danger')).toContainText(
      'Could not add this item to your favorites.'
    );
    await expect(actionButton(page)).toContainText('Add to favorites');
    expect(await storedFavorites(api)).toEqual([]);
  });

  // Not covered (as in the Cypress spec): the "Could not load your favorites." path. Failing GET /user/currentUser
  // also breaks the cockpit shell bootstrap, so the action bar never renders on the mock.
});
