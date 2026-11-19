import { expect, test } from '@cumulocity-iot/ui-sdk/playwright';
import type { APIRequestContext, Locator, Page } from '@playwright/test';

/**
 * Navigation and search — "Tree" navigator entry + explorer drawer.
 * Converted from cypress/e2e/navigation-and-search-tree.cy.ts. Runs against the tenant mock (windy-dev world:
 * a site → subsystems → leaf assets → devices); names and ids are read from the inventory at runtime.
 * The mock is reset before every test, so preferences (pin, width, recent assets) start from the world.
 */

const NAV_NODE = 'c8y-navigator-node button[data-cy="Tree"]';
const DRAWER = '[data-cy="navigation-and-search--drawer"]';
const BACKDROP = '[data-cy="navigation-and-search--backdrop"]';
const ROW = '[data-cy="navigation-and-search--row"]';
const FILTER = '[data-cy="navigation-and-search--filter"]';
const PIN = '[data-cy="navigation-and-search--pin"]';
const GRIP = '[data-cy="navigation-and-search--grip"]';
const cy = (name: string) => `[data-cy="navigation-and-search--${name}"]`;

interface MO {
  id: string;
  name: string;
  type: string;
}

interface World {
  site: MO;
  subsystem: MO;
  leaf: MO;
  leafCount: number;
  deviceCount: number;
  assetCount: number;
}

/** Site (root asset) → a subsystem with leaves → one leaf asset, read from the mock inventory. */
async function readWorld(api: APIRequestContext): Promise<World> {
  const res = await api.get('/inventory/managedObjects?pageSize=2000&withChildren=true');
  const all = (await res.json()).managedObjects as (MO & {
    c8y_IsAsset?: object;
    c8y_IsDevice?: object;
    childAssets?: { references: { managedObject: { id: string } }[] };
  })[];
  const assets = all.filter((mo) => mo.c8y_IsAsset);
  const plainDevices = all.filter((mo) => mo.c8y_IsDevice && !mo.c8y_IsAsset);
  const parentOf = (id: string) =>
    assets.find((a) => (a.childAssets?.references ?? []).some((r) => r.managedObject.id === id));
  const hasChildAsset = (mo: (typeof assets)[number]) =>
    (mo.childAssets?.references ?? []).some((r) => assets.some((a) => a.id === r.managedObject.id));
  const leaves = assets.filter((a) => !hasChildAsset(a));
  const leaf = leaves.find((t) => parentOf(t.id) && parentOf(parentOf(t.id)!.id)) as MO;
  const subsystem = parentOf(leaf.id) as MO;
  const site = parentOf(subsystem.id) as MO;

  const inSite = (id: string): boolean =>
    id === site.id || (!!parentOf(id) && inSite(parentOf(id)!.id));
  const assetCount = assets.filter((a) => inSite(a.id)).length;
  const leafCount = leaves.filter((a) => inSite(a.id)).length;
  // devices are counted below the asset that references them
  const deviceCount = plainDevices.filter((d) => {
    const parent = parentOf(d.id);
    return !!parent && inSite(parent.id);
  }).length;

  return { site, subsystem, leaf, leafCount, deviceCount, assetCount };
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function rowNamed(page: Page, name: string): Locator {
  return page.locator(ROW).filter({
    has: page.locator(cy('row-name'), { hasText: new RegExp(`^\\s*${escape(name)}\\s*$`) }),
  });
}

async function openDrawer(page: Page, visitApp: (path?: string, o?: object) => Promise<void>) {
  await visitApp('', { language: 'en', waitFor: NAV_NODE });
  await page.locator(NAV_NODE).click();
  await expect(page.locator(DRAWER)).toBeVisible();
  await expect(page.locator(ROW).first()).toBeVisible({ timeout: 30_000 });
}

/** Counts the PUTs of user preferences (UserPreferencesService stores them on the current user). */
function countPreferenceWrites(page: Page): () => number {
  let count = 0;

  page.on('request', (r) => {
    if (r.method() === 'PUT' && new URL(r.url()).pathname.endsWith('/user/currentUser')) count += 1;
  });

  return () => count;
}

const width = async (locator: Locator) => (await locator.boundingBox())!.width;

test.describe('Navigation and search — tree drawer', () => {
  let world: World;

  test.beforeAll(async ({ mock, api }) => {
    await mock.reset();
    world = await readWorld(api);
  });

  test.beforeEach(async ({ mock }) => {
    await mock.reset();
  });

  test('opens the drawer from the "Tree" navigator entry and closes it via button, backdrop and entry', async ({
    page,
    visitApp,
  }) => {
    await visitApp('', { language: 'en', waitFor: '#navigator' });
    const drawer = page.locator(DRAWER);

    await expect(drawer).toHaveCount(0);

    await page.locator(NAV_NODE).click();
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText('Assets');
    await page.locator(cy('close')).click();
    await expect(drawer).toHaveCount(0);

    await page.locator(NAV_NODE).click();
    await expect(drawer).toBeVisible();
    const backdrop = page.locator(BACKDROP);
    const box = (await backdrop.boundingBox())!;

    await backdrop.click({ position: { x: box.width - 5, y: box.height / 2 } });
    await expect(drawer).toHaveCount(0);

    // the entry itself toggles; the backdrop covers it while the drawer is open, so the click is dispatched to it
    await page.locator(NAV_NODE).click();
    await expect(drawer).toBeVisible();
    await page.locator(NAV_NODE).dispatchEvent('click');
    await expect(drawer).toHaveCount(0);
  });

  test('pins the drawer (no backdrop, survives a reload) and unpins it again', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    const writes = countPreferenceWrites(page);
    const pin = page.locator(PIN);

    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await pin.click();
    await expect.poll(writes).toBe(1);
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(pin).toHaveAttribute('title', 'Unpin drawer');
    await expect(page.locator(BACKDROP)).toHaveCount(0);

    await page.reload();
    await page.locator(NAV_NODE).click({ timeout: 60_000 });
    await expect(pin).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator(BACKDROP)).toHaveCount(0);

    const before = writes();

    await pin.click();
    await expect.poll(writes).toBe(before + 1);
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator(BACKDROP)).toHaveCount(1);

    await page.reload();
    await page.locator(NAV_NODE).click({ timeout: 60_000 });
    await expect(pin).toHaveAttribute('aria-pressed', 'false');
  });

  test('resizes the drawer with the grip (keyboard) and keeps the width', async ({
    page,
    visitApp,
  }) => {
    const writes = countPreferenceWrites(page);

    await openDrawer(page, visitApp);
    const grip = page.locator(GRIP);
    const start = Number(await grip.getAttribute('aria-valuenow'));

    await grip.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect(grip).toHaveAttribute('aria-valuenow', String(start + 40));
    expect(await width(page.locator(DRAWER))).toBeCloseTo(start + 40, 0);
    await page.keyboard.press('ArrowLeft');
    await expect(grip).toHaveAttribute('aria-valuenow', String(start + 30));
    await expect.poll(writes).toBeGreaterThanOrEqual(2);

    await page.reload();
    await page.locator(NAV_NODE).click({ timeout: 60_000 });
    await expect(grip).toHaveAttribute('aria-valuenow', String(start + 30));

    // clamped at the maximum
    const max = await grip.getAttribute('aria-valuemax');

    await grip.focus();
    for (let i = 0; i < 40; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect(grip).toHaveAttribute('aria-valuenow', String(max));
  });

  test('renders the hierarchy site → subsystem → leaf and expands / collapses all', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    const rows = page.locator(ROW);

    await page.locator(cy('collapse-all')).click();
    await expect(rows).toHaveCount(1);
    await expect(rowNamed(page, world.site.name)).toHaveAttribute('aria-level', '1');
    await expect(rowNamed(page, world.site.name)).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator(cy('summary'))).toContainText('Hierarchy · 1 node');
    await expect(page.locator(cy('collapse-all'))).toBeDisabled();

    // the twisty opens one level: the subsystems, still collapsed
    await rowNamed(page, world.site.name).locator(cy('row-toggle')).click();
    await expect(rowNamed(page, world.site.name)).toHaveAttribute('aria-expanded', 'true');
    await expect(rowNamed(page, world.subsystem.name)).toHaveAttribute('aria-level', '2');
    await expect(rowNamed(page, world.subsystem.name)).toHaveAttribute('aria-expanded', 'false');
    await expect(rows.filter({ hasText: world.leaf.name })).toHaveCount(0);

    await rowNamed(page, world.subsystem.name).locator(cy('row-toggle')).click();
    await expect(rowNamed(page, world.leaf.name)).toHaveAttribute('aria-level', '3');

    // expand all: every asset of the site is a visible node
    await expect(page.locator(cy('expand-all'))).toBeEnabled();
    await page.locator(cy('expand-all')).click();
    await expect(page.locator(cy('summary'))).toContainText(
      `Hierarchy · ${world.assetCount} nodes`
    );
    await expect(page.locator(cy('expand-all'))).toBeDisabled();

    await expect(page.locator(cy('collapse-all'))).toBeEnabled();
    await page.locator(cy('collapse-all')).click();
    await expect(rows).toHaveCount(1);
  });

  test('shows the device count in the footer and a status dot on every row', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    // no Digital Twin Manager on the mock: the footer counts devices
    await expect(page.locator(cy('footer-count'))).toHaveText(`${world.deviceCount} devices`);
    const rows = await page.locator(ROW).count();

    await expect(page.locator(`${ROW} ${cy('row-status')}`)).toHaveCount(rows);
  });

  test('filters the tree (exact and fuzzy), shows the empty state and resets', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    const code = world.leaf.name.split(' ')[0];
    const filter = page.locator(FILTER);

    await filter.fill(code);
    await expect(rowNamed(page, world.leaf.name).locator('mark').first()).toContainText(code);
    // ancestors stay visible for context
    await expect(rowNamed(page, world.site.name)).toHaveCount(1);
    await expect(rowNamed(page, world.subsystem.name)).toHaveCount(1);
    await expect.poll(() => page.locator(ROW).count()).toBeLessThan(world.leafCount);

    await filter.fill('zzqqxxyy-nothing');
    await expect(page.locator(cy('empty'))).toContainText('No asset matches the filter.');
    await expect(page.locator(ROW)).toHaveCount(0);

    const reset = page.locator(cy('filter-reset'));

    await expect(reset).toHaveAttribute('title', 'Reset');
    await reset.click();
    await expect(filter).toHaveValue('');
    await expect(reset).toHaveAttribute('title', 'Search');
    await expect(rowNamed(page, world.site.name)).toHaveCount(1);
    await expect(page.locator(cy('empty'))).toHaveCount(0);
  });

  test('falls back to a fuzzy match and says so', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);
    // a transposition in the site name ("Cuxhaven" → "Cuxhvaen"): no literal, prefix or
    // subsequence match, only the widened typo pass finds it
    const word = world.site.name.split(' ')[0];

    expect(word.length, 'site name word long enough for a typo').toBeGreaterThan(5);
    const typo = word.slice(0, 4) + word[5] + word[4] + word.slice(6);

    await page.locator(FILTER).fill(typo);
    await expect(page.locator(cy('fuzzy-hint'))).toContainText(
      'No exact match — showing similar names.'
    );
    await expect(rowNamed(page, world.site.name)).toHaveCount(1);
  });

  test('navigates to the asset on row click, marks it current and shows the path header', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    await page.locator(FILTER).fill(world.leaf.name.split(' ')[0]);
    await rowNamed(page, world.leaf.name).click();

    await expect(page).toHaveURL(new RegExp(`#/group/${world.leaf.id}`));
    await expect(page.locator(DRAWER)).toBeVisible();
    await expect(rowNamed(page, world.leaf.name)).toHaveAttribute('aria-selected', 'true');
    await expect(rowNamed(page, world.leaf.name).locator(cy('row-current'))).toContainText(
      'Current'
    );

    const path = page.locator(cy('path'));

    await expect(path).toContainText(world.site.name);
    await expect(path).toContainText(world.subsystem.name);
    await expect(path).toContainText(world.leaf.name);
    await expect(path.locator('.ps-drawer__path-last')).toContainText(world.leaf.name);
  });

  test('opens the detail panel from the info button and opens the asset from there', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    await page.locator(FILTER).fill(world.leaf.name.split(' ')[0]);
    const row = rowNamed(page, world.leaf.name);

    await row.hover();
    await row.locator(cy('row-info')).click();

    await expect(page.locator(cy('detail'))).toBeVisible();
    await expect(page.locator(cy('detail-title'))).toContainText(world.leaf.name);
    await page.locator(cy('detail-open')).click();
    await expect(page).toHaveURL(new RegExp(`#/group/${world.leaf.id}`));
  });

  test('resizes the drawer by dragging the grip', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);
    const grip = page.locator(GRIP);
    const start = Number(await grip.getAttribute('aria-valuenow'));
    const box = (await grip.boundingBox())!;
    const x = box.x + box.width / 2;

    await page.mouse.move(x, 300);
    await page.mouse.down();
    await page.mouse.move(x + 100, 300, { steps: 5 });
    await page.mouse.up();
    await expect(grip).toHaveAttribute('aria-valuenow', String(start + 100));
    expect(await width(page.locator(DRAWER))).toBeCloseTo(start + 100, 0);
  });

  test('navigates the tree with the keyboard, hands typing to the filter and closes on Escape', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    await page.locator(cy('collapse-all')).click();
    await expect(page.locator(ROW)).toHaveCount(1);
    const tree = page.locator(`${DRAWER} [role="tree"][aria-label="Asset hierarchy"]`);
    const siteRow = `ps-tree-row-${world.site.id}`;

    await tree.focus();
    await tree.press('ArrowDown');
    await expect(tree).toHaveAttribute('aria-activedescendant', siteRow);
    await tree.press('ArrowRight');
    await expect(rowNamed(page, world.site.name)).toHaveAttribute('aria-expanded', 'true');
    await tree.press('ArrowRight');
    await expect(tree).not.toHaveAttribute('aria-activedescendant', siteRow);
    // ← walks back to the parent, → steps into the first child again
    await tree.press('ArrowLeft');
    await expect(tree).toHaveAttribute('aria-activedescendant', siteRow);
    await tree.press('ArrowRight');
    await expect(tree).not.toHaveAttribute('aria-activedescendant', siteRow);
    const active = (await tree.getAttribute('aria-activedescendant'))!;
    const id = active.replace('ps-tree-row-', '');

    await expect(page.locator(`#${active}`)).toHaveAttribute('aria-level', '2');
    // Enter opens the focused row; the drawer stays open
    await tree.press('Enter');
    await expect(page).toHaveURL(new RegExp(`#/group/${id}`));
    await expect(page.locator(DRAWER)).toBeVisible();

    // keyboard focus opens the row's detail panel; Escape closes the innermost level first
    await tree.focus();
    await tree.press('ArrowUp');
    await tree.press('ArrowDown');
    await expect(page.locator(cy('detail'))).toBeVisible();
    await tree.press('Escape');
    await expect(page.locator(cy('detail'))).toHaveCount(0);
    await expect(page.locator(DRAWER)).toBeVisible();
    await tree.press('Escape');
    await expect(page.locator(DRAWER)).toHaveCount(0);

    // a printable key on the tree is type-ahead into the filter
    await page.locator(NAV_NODE).click();
    await tree.focus();
    await tree.press('w');
    await expect(page.locator(FILTER)).toHaveValue('w');
  });

  test('opens the detail panel on hover and pins the asset to "Pinned & Recent"', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    const counts = page.locator(cy('quick-access-counts'));

    await expect(counts).toHaveText(/^\s*0\+\d+\s*$/);
    await page.locator(FILTER).fill(world.leaf.name.split(' ')[0]);
    await rowNamed(page, world.leaf.name).hover();

    await expect(page.locator(cy('detail'))).toBeVisible();
    await expect(page.locator(cy('detail-title'))).toContainText(world.leaf.name);
    await expect(page.locator(cy('detail-pin'))).toContainText('Pin');
    await page.locator(cy('detail-pin')).click();
    await expect(page.locator(cy('detail-pin'))).toContainText('Unpin');

    await expect(rowNamed(page, world.leaf.name).locator('.ps-tree-row__pin')).toHaveCount(1);
    await expect(counts).toHaveText(/^\s*1\+\d+\s*$/);

    // the detail panel's Alarms action routes to the asset's alarm tab
    await page.locator(cy('detail-alarms')).click();
    await expect(page).toHaveURL(new RegExp(`#/group/${world.leaf.id}/alarms`));
  });

  test.describe('large tenants (high-volume mode)', () => {
    test.beforeEach(async ({ page }) => {
      // The size probe decides the mode: report a tenant far beyond what the tree holds at
      // once, so roots load up front and every branch on demand.
      await page.route(
        (url) =>
          url.pathname.endsWith('/inventory/managedObjects') &&
          url.searchParams.get('pageSize') === '1' &&
          url.searchParams.get('withTotalPages') === 'true' &&
          url.searchParams.get('withChildren') === 'false',
        async (route) => {
          const response = await route.fetch();
          const body = await response.json();

          body.statistics = { ...(body.statistics ?? {}), totalPages: 1_000_000 };
          await route.fulfill({ response, json: body });
        }
      );
    });

    /** Opens a branch row by clicking its body (not the twisty), unless it is open already. */
    async function openByRowClick(page: Page, name: string) {
      const row = rowNamed(page, name);

      await expect(row).toBeVisible();
      if ((await row.getAttribute('aria-expanded')) !== 'true')
        await row.locator(cy('row-name')).click();
    }

    test('loads the children of a branch opened by clicking its row, below the prefetched levels', async ({
      page,
      api,
      visitApp,
    }) => {
      const nested = `E2E nested ${Date.now()}`;

      // a child asset under a leaf: three levels deep, below the two the startup prefetch loads
      const created = await (
        await api.post('/inventory/managedObjects', {
          data: { name: nested, type: 'e2e_Nested', c8y_IsAsset: {} },
        })
      ).json();

      await api.post(`/inventory/managedObjects/${world.leaf.id}/childAssets`, {
        data: { managedObject: { id: created.id } },
      });
      const sizeProbe = page.waitForRequest(
        (r) => r.url().includes('pageSize=1') && r.url().includes('withTotalPages=true')
      );

      await openDrawer(page, visitApp);
      await sizeProbe;

      await openByRowClick(page, world.site.name);
      await openByRowClick(page, world.subsystem.name);
      await openByRowClick(page, world.leaf.name);

      await expect(rowNamed(page, nested)).toHaveCount(1);
    });

    test('hands a term without match in the loaded branches over to the global search', async ({
      page,
      visitApp,
    }) => {
      await visitApp(`group/${world.site.id}`, { language: 'en', waitFor: NAV_NODE });
      await page.locator(NAV_NODE).click();
      await expect(page.locator(DRAWER)).toBeVisible();
      await expect(page.locator(ROW).first()).toBeVisible({ timeout: 30_000 });

      await page.locator(FILTER).fill('zzqqxxyy');
      await expect(page.locator(cy('empty'))).toContainText(
        'Nothing in the loaded branches matches that.'
      );
      await page.locator(cy('global-search')).click();

      await expect(page.locator('[data-cy="asset-search--input"]')).toBeVisible();
      await expect(page.locator('[data-cy="asset-search--input"]')).toHaveValue('zzqqxxyy');
    });
  });
});
