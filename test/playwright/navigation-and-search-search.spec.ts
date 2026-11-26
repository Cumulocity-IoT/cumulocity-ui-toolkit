import { expect, settleClock, test } from './support/fixtures';
import { TRIGGER, exact, type VisitApp } from './support/navigation-and-search';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

/**
 * Navigation and search — global search (`globalSearchViewProviders`): header search button and the
 * ⌘K / Ctrl+K palette over all assets and devices. Runs against the tenant mock (windy-dev). Converted from
 * cypress/e2e/navigation-and-search-search.cy.ts.
 *
 * Covered:
 *  - header button opens / closes the palette (button, backdrop, close button, Escape)
 *  - the ⌘K / Ctrl+K chord opens the palette from anywhere
 *  - typing finds assets and devices (exact, highlighted; and abbreviated / subsequence)
 *  - clicking a device result routes to the device, an asset result to the group route
 *  - keyboard: ↓ / ↑ move the highlight, Enter opens the highlighted entry
 *  - shortcut chips (alarm severity, asset type) → filter chips; remove via × and Backspace
 *  - "Add filter" suggestions for typed text, accepted with →
 *  - recent entries remembered and shown for an empty query
 *  - Escape clears the query first, then closes; empty-result state
 *
 * Names and ids are read from the mock inventory at runtime.
 */

const PALETTE = '[data-cy="asset-search--palette"]';
const INPUT = '[data-cy="asset-search--input"]';
const RESULT = '[data-cy="asset-search--result"]';
const CHIP = '[data-cy="asset-search--chip"]';
const GROUP_LABEL = '[data-cy="asset-search--group-label"]';

interface MO {
  id: string;
  name: string;
  type: string;
}

interface World {
  device: MO; // a pure device (no c8y_IsAsset): routes to /device/<id>
  turbine: MO; // an asset: routes to /group/<id>
  all: MO[];
}

async function loadWorld(api: APIRequestContext): Promise<World> {
  const res = await api.get('/inventory/managedObjects?pageSize=2000&withChildren=false');
  const all = (await res.json()).managedObjects as (MO & Record<string, unknown>)[];
  const devices = all.filter(
    (mo) => 'c8y_IsDevice' in mo && !('c8y_IsAsset' in mo) && !('c8y_IsDeviceGroup' in mo)
  );
  // One whose name prefix another object shares ("CUWTG06-Main-Controller" and its turbine "CUWTG06 · …"):
  // the arrow-key test needs two results. The inventory's order is not the world file's.
  const prefix = (mo: MO) => mo.name.split('-')[0].toLowerCase();
  const device = (devices.find((mo) =>
    all.some((other) => other.id !== mo.id && other.name.toLowerCase().includes(prefix(mo)))
  ) ?? devices[0]) as MO;
  const turbine = all.find((mo) => mo.type === 'wind_turbine') as MO;

  return { device, turbine, all };
}

const visitHome = (visitApp: VisitApp) => visitApp('', { language: 'en', waitFor: TRIGGER });

async function openPalette(page: Page, visitApp: VisitApp) {
  await visitHome(visitApp);
  await page.locator(TRIGGER).click();
  await expect(page.locator(PALETTE)).toBeVisible();
  await expect(page.locator(INPUT)).toBeFocused();
}

/**
 * The first search assembles the corpus (fleet sweep + device fetch) before it can answer, so
 * the first result-dependent assertion of a test gets a longer timeout.
 */
const CORPUS = { timeout: 30_000 };

function resultNamed(page: Page, name: string): Locator {
  return page.locator(RESULT).filter({
    has: page.locator('.ps-search-result__name', { hasText: exact(name) }),
  });
}

const selected = (page: Page) => page.locator(`${RESULT}[aria-selected="true"]`);

test.describe('Navigation and search — global search', () => {
  let world: World;

  test.beforeEach(async ({ mock, api }) => {
    await mock.reset();
    world = await loadWorld(api);
  });

  test('opens and closes the palette from the header button, backdrop and close button', async ({
    page,
    visitApp,
  }) => {
    await visitHome(visitApp);
    const trigger = page.locator(TRIGGER);

    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toHaveAttribute('title', /^Search \((⌘|Ctrl)\+K\)$/);
    await expect(page.locator(PALETTE)).toHaveCount(0);

    await trigger.click();
    await expect(page.locator(PALETTE)).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(INPUT)).toBeFocused();
    await expect(page.locator(INPUT)).toHaveAttribute('placeholder', /K\)$/);

    // the palette covers the backdrop's centre; the click lands on the free bottom-right corner
    const backdrop = page.locator('.ps-search-backdrop');
    const box = (await backdrop.boundingBox())!;

    await backdrop.click({ position: { x: box.width - 5, y: box.height - 5 } });
    await expect(page.locator(PALETTE)).toHaveCount(0);

    await trigger.click();
    const close = page.locator('[data-cy="asset-search--clear"]');

    await expect(close).toHaveAttribute('title', 'Close');
    await close.click();
    await expect(page.locator(PALETTE)).toHaveCount(0);
  });

  test('stays open while the shell changes the URL right after load', async ({
    page,
    visitApp,
  }) => {
    // Cockpit's home route appends its global-context query params shortly after load, and the
    // action bar re-creates every header action on that URL change. The palette's open state
    // lives in a root service, so the re-created trigger renders it again.
    await visitHome(visitApp);
    await page.locator(TRIGGER).click();
    await expect(page.locator(PALETTE)).toBeVisible();
    await expect(page).toHaveURL(/globalContextRefreshMode/);
    await expect(page.locator(PALETTE)).toBeVisible();
  });

  test('opens the palette with the ⌘K / Ctrl+K chord', async ({ page, visitApp }) => {
    await visitHome(visitApp);
    await expect(page.locator(PALETTE)).toHaveCount(0);
    const mac = (await page.locator(TRIGGER).getAttribute('title'))?.includes('⌘');

    await page.locator('body').press(mac ? 'Meta+k' : 'Control+k');
    await expect(page.locator(PALETTE)).toBeVisible();
    await expect(page.locator(INPUT)).toBeFocused();
  });

  test('finds a device by name and routes to the device on click', async ({
    page,
    visitApp,
    reviewScreenshot,
  }) => {
    await openPalette(page, visitApp);
    await page.locator(INPUT).fill(world.device.name);
    await expect(page.locator(GROUP_LABEL, { hasText: 'Assets and devices' })).toBeVisible(CORPUS);
    await expect(resultNamed(page, world.device.name)).toBeVisible(CORPUS);
    await reviewScreenshot('navigation-and-search/search-results');
    await resultNamed(page, world.device.name).click();

    await expect(page).toHaveURL(new RegExp(`#/device/${world.device.id}`));
    await expect(page.locator(PALETTE)).toHaveCount(0);
  });

  test('finds an asset by an abbreviation and routes to the group view', async ({
    page,
    visitApp,
  }) => {
    await openPalette(page, visitApp);
    // drop every separator and the model suffix: "CUWTG01 · Enercon …" → "cuwtg01"
    const code = world.turbine.name.split(' ')[0].toLowerCase();

    await page.locator(INPUT).fill(code);
    await expect(resultNamed(page, world.turbine.name).locator('.label')).toContainText(
      world.turbine.type,
      CORPUS
    );
    await resultNamed(page, world.turbine.name).click();
    await expect(page).toHaveURL(new RegExp(`#/group/${world.turbine.id}`));
  });

  test('moves the highlight with the arrow keys and opens the highlighted entry with Enter', async ({
    page,
    visitApp,
  }) => {
    await openPalette(page, visitApp);
    const input = page.locator(INPUT);

    // "CUWTG06-Main-Controller" → "CUWTG06": the controller and its turbine both match
    await input.fill(world.device.name.split('-')[0]);
    await expect.poll(() => page.locator(RESULT).count(), CORPUS).toBeGreaterThan(1);

    await expect(selected(page)).toHaveAttribute('data-entry-index', '0');
    await input.press('ArrowDown');
    await expect(selected(page)).toHaveAttribute('data-entry-index', '1');
    await input.press('ArrowUp');
    await expect(selected(page)).toHaveAttribute('data-entry-index', '0');
    // ↑ from the first entry wraps to the last
    await input.press('ArrowUp');
    await expect(page.locator(RESULT).last()).toHaveAttribute('aria-selected', 'true');

    // Home, then ↓ to the exact device result, and open it from the keyboard
    await input.press('Home');
    await expect(selected(page)).toHaveAttribute('data-entry-index', '0');
    const index = Number(
      await resultNamed(page, world.device.name).getAttribute('data-entry-index')
    );

    for (let i = 0; i < index; i++) await input.press('ArrowDown');
    await expect(resultNamed(page, world.device.name)).toHaveAttribute('aria-selected', 'true');
    await input.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#/device/${world.device.id}`));
    await expect(page.locator(PALETTE)).toHaveCount(0);
  });

  test('turns shortcut chips into filters and removes them via × and Backspace', async ({
    page,
    visitApp,
  }) => {
    // Type chips come from the DTM asset catalog — no microservices on the mock, so stub it.
    await page.route('**/service/dtm/definitions/assets*', (route) =>
      route.fulfill({
        json: {
          definitions: [
            { identifier: 'wind_turbine', jsonSchema: { title: 'Wind turbine' } },
            { identifier: 'pv_inverter', jsonSchema: { title: 'PV inverter' } },
          ],
        },
      })
    );
    await page.route('**/service/dtm/definitions/properties*', (route) =>
      route.fulfill({ json: { definitions: [] } })
    );
    const dtmAssets = page.waitForRequest('**/service/dtm/definitions/assets*');

    await openPalette(page, visitApp);
    await dtmAssets;
    await expect(page.locator('[data-cy="asset-search--severity"]')).toHaveCount(4);
    await expect(page.locator('[data-cy="asset-search--facet"]')).toHaveCount(2, CORPUS);

    // type facet → chip, results restricted to that type
    await page.locator('[data-cy="asset-search--facet"]', { hasText: 'Wind turbine' }).click();
    await expect(page.locator(CHIP)).toHaveCount(1);
    await expect(page.locator(CHIP)).toContainText('Type');
    await expect.poll(() => page.locator(RESULT).count()).toBeGreaterThan(0);
    for (const type of await page.locator(`${RESULT} .ps-search-result__type`).allTextContents())
      expect(type.trim()).toBe('wind_turbine');
    await page.locator('[data-cy="asset-search--chip-remove"]').click();
    await expect(page.locator(CHIP)).toHaveCount(0);

    // severity chip → chip; Backspace on an empty input removes the last chip
    const severity = page.locator('[data-cy="asset-search--severity"]').first();

    await severity.click();
    await expect(severity).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(CHIP)).toHaveCount(1);
    await expect(page.locator(CHIP)).toContainText('Alarm');
    await page.locator(INPUT).focus();
    await page.locator(INPUT).press('Backspace');
    await expect(page.locator(CHIP)).toHaveCount(0);
  });

  test('suggests a filter for the typed text and adds it with →', async ({ page, visitApp }) => {
    await openPalette(page, visitApp);
    await page.locator(INPUT).fill('wind turbine');
    await expect(page.locator(GROUP_LABEL, { hasText: 'Add filter' })).toBeVisible(CORPUS);
    await expect(page.locator(`${RESULT}[aria-label^="Add filter: Type"]`).first()).toBeVisible();
    await page.locator(INPUT).press('ArrowRight');
    await expect(page.locator(CHIP)).toHaveCount(1);
    await expect(page.locator(CHIP)).toContainText('Type');
  });

  test('remembers opened entries and lists them as recent for an empty query', async ({
    page,
    visitApp,
  }) => {
    const savePreference = page.waitForRequest(
      (r) => r.method() === 'PUT' && new URL(r.url()).pathname.endsWith('/user/currentUser')
    );

    await openPalette(page, visitApp);
    await page.locator(INPUT).fill(world.device.name);
    await expect(resultNamed(page, world.device.name)).toBeVisible(CORPUS);
    await resultNamed(page, world.device.name).click();
    await savePreference;
    await expect(page).toHaveURL(new RegExp(`#/device/${world.device.id}`));

    await visitHome(visitApp);
    await page.locator(TRIGGER).click();
    await expect(page.locator(GROUP_LABEL, { hasText: 'Recent' })).toBeVisible();
    await expect(resultNamed(page, world.device.name)).toHaveCount(1);
  });

  test('clears the query with Escape first, then closes; shows the empty state', async ({
    page,
    visitApp,
  }) => {
    await openPalette(page, visitApp);
    const input = page.locator(INPUT);

    await input.fill('zzqqxxyy-no-such-thing');
    // the empty state follows the debounced query: a frozen clock holds it back
    await settleClock(page);
    await expect(page.locator('[data-cy="asset-search--empty"]')).toContainText(
      'No assets or devices match that search.',
      CORPUS
    );
    await expect(page.locator(RESULT)).toHaveCount(0);
    await expect(page.locator('[data-cy="asset-search--clear"]')).toHaveAttribute(
      'title',
      'Clear search'
    );

    await input.press('Escape');
    await expect(input).toHaveValue('');
    await expect(page.locator(PALETTE)).toBeVisible();
    await expect(page.locator('[data-cy="asset-search--empty"]')).toHaveCount(0);

    await input.press('Escape');
    await expect(page.locator(PALETTE)).toHaveCount(0);
  });
});
