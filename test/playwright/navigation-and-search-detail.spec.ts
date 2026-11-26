import { expect, test } from './support/fixtures';
import {
  cy,
  NAV_NODE,
  ROW,
  FILTER,
  DETAIL,
  FIELD,
  FIELDCFG,
  PREVIEW,
  FOOTER_COUNT,
  exact,
  rowNamed,
  openDrawer,
  closeSettings,
  levelChip,
  openLevel,
} from './support/navigation-and-search';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { makeUnavailable, restoreWorld } from './support/availability';

/**
 * Navigation and search — generic counts, availability and the configurable detail panel, on the tenant
 * mock (windy-dev world, but nothing here depends on its types). Converted from
 * cypress/e2e/navigation-and-search-detail.cy.ts.
 *
 * Covered:
 *  - footer counts devices without the Digital Twin Manager (the mock has none) and assets with it
 *    (DTM stubbed), matching the world
 *  - availability from `c8y_Availability` (a device made unavailable in the mock's world): footer stat + row ring
 *  - branch detail rows (Devices / Available x of y / Unavailable / Alarms)
 *  - leaf detail panel shows the default fields
 *  - the settings drawer's "Detail fields by level" tab: one entry per type of the tree, a live
 *    preview; editing a type's fields stores `detailPanel` in the user's settings and survives a
 *    reload; reset to default; the default list
 *
 * Names, ids and counts are read from the inventory at runtime — the world is re-pulled in CI.
 */

const DEFAULT_LABELS = ['Status', 'Alarms', 'Type', 'Last updated', 'Model', 'Serial', 'Firmware'];

interface MO {
  id: string;
  name: string;
  type: string;
  c8y_IsAsset?: object;
  c8y_IsDevice?: object;
  childAssets?: { references: { managedObject: { id: string } }[] };
}

interface World {
  site: MO;
  /** A leaf asset (no child assets) with at least one device below it. */
  leaf: MO;
  /** The plain devices below `leaf`. */
  leafDevices: MO[];
  assetCount: number;
  deviceCount: number;
  availableCount: number;
}

/** The root asset, its assets and the devices below them — what the tree sweeps and counts. */
async function loadWorld(api: APIRequestContext): Promise<World> {
  const res = await api.get('/inventory/managedObjects?pageSize=2000&withChildren=true');
  const all = (await res.json()).managedObjects as (MO & {
    c8y_Availability?: { status?: string };
  })[];
  const byId = new Map(all.map((mo) => [mo.id, mo]));
  const childrenOf = (mo: MO) =>
    (mo.childAssets?.references ?? [])
      .map((ref) => byId.get(ref.managedObject.id))
      .filter((child): child is MO => !!child);
  const isAsset = (mo: MO) => !!mo.c8y_IsAsset;
  const isPlainDevice = (mo: MO) => !!mo.c8y_IsDevice && !mo.c8y_IsAsset;
  const referenced = new Set(all.flatMap((mo) => childrenOf(mo).map((child) => child.id)));
  const site = all.find((mo) => isAsset(mo) && !referenced.has(mo.id)) as MO;

  const assets: MO[] = [];
  const devices: MO[] = [];
  const walk = (mo: MO) => {
    assets.push(mo);

    for (const child of childrenOf(mo)) {
      if (isAsset(child)) walk(child);
      else if (isPlainDevice(child)) devices.push(child);
    }
  };

  walk(site);

  const leaf = assets.find(
    (mo) => !childrenOf(mo).some(isAsset) && childrenOf(mo).some(isPlainDevice)
  ) as MO;
  const available = devices.filter(
    (mo) => byId.get(mo.id)?.c8y_Availability?.status === 'AVAILABLE'
  );

  return {
    site,
    leaf,
    leafDevices: childrenOf(leaf).filter(isPlainDevice),
    assetCount: assets.length,
    deviceCount: devices.length,
    availableCount: available.length,
  };
}

/** Narrows the tree to `name` and hovers its row: the detail panel of that asset opens. */
async function hover(page: Page, name: string) {
  await page.locator(FILTER).fill(name);
  await rowNamed(page, name).hover();
  await expect(page.locator(DETAIL)).toBeVisible();
  await expect(page.locator(cy('detail-title'))).toContainText(name);
}

const trimmed = (texts: string[]) => texts.map((t) => t.trim());

const fieldLabels = (page: Page) =>
  page.locator(`${DETAIL} ${FIELD} dt`).allTextContents().then(trimmed);

const previewLabels = (page: Page) =>
  page.locator(`${PREVIEW} ${FIELD} dt`).allTextContents().then(trimmed);

function fieldValue(page: Page, label: string): Locator {
  return page
    .locator(`${DETAIL} ${FIELD}`)
    .filter({ has: page.locator('dt', { hasText: exact(label) }) })
    .locator('dd');
}

/**
 * The settings writes (PUT /user/currentUser with `ps_AssetNavigatorSettings`): the tree also stores recents and
 * the drawer's pin/width on the user. `next()` hands out the writes in order, like Cypress' aliased waits.
 */
function recordSettingsWrites(page: Page) {
  const bodies: Record<string, any>[] = [];
  let cursor = 0;

  page.on('request', (r) => {
    if (r.method() !== 'PUT' || !new URL(r.url()).pathname.endsWith('/user/currentUser')) return;
    const body = r.postDataJSON() as { customProperties?: Record<string, unknown> } | null;

    if (body?.customProperties?.['ps_AssetNavigatorSettings'] !== undefined)
      bodies.push(body.customProperties['ps_AssetNavigatorSettings'] as Record<string, any>);
  });

  return {
    /** The next settings write, as sent. */
    next: async () => {
      await expect.poll(() => bodies.length > cursor, { timeout: 15_000 }).toBe(true);

      return bodies[cursor++];
    },
  };
}

type Writes = ReturnType<typeof recordSettingsWrites>;

/** The stored detail panel, as the next settings write sends it. */
const savedDetailPanel = async (writes: Writes) => (await writes.next()).detailPanel;

test.describe('Navigation and search — counts, availability and detail fields', () => {
  let world: World;

  test.beforeEach(async ({ mock, api }) => {
    await mock.reset();
    world = await loadWorld(api);
  });

  test.afterEach(async ({ mock }) => {
    await restoreWorld(mock);
  });

  test('counts devices without the Digital Twin Manager', async ({ page, visitApp }) => {
    await openDrawer(page, visitApp);
    await expect(page.locator(FOOTER_COUNT)).toHaveText(`${world.deviceCount} devices`);
    const count = rowNamed(page, world.site.name).locator(cy('row-count'));

    await expect(count).toHaveText(String(world.deviceCount));
    await expect(count).toHaveAttribute('title', `Devices: ${world.deviceCount}`);
  });

  test('counts assets when the Digital Twin Manager answers', async ({ page, visitApp }) => {
    await page.route('**/service/dtm/definitions/assets*', (route) =>
      route.fulfill({ json: { definitions: [] } })
    );
    await page.route('**/service/dtm/definitions/properties*', (route) =>
      route.fulfill({ json: { definitions: [] } })
    );
    const dtmAssets = page.waitForRequest('**/service/dtm/definitions/assets*');

    await openDrawer(page, visitApp);
    await dtmAssets;
    await expect(page.locator(FOOTER_COUNT)).toHaveText(`${world.assetCount} assets`);
    // the badge counts the site's descendants
    const count = rowNamed(page, world.site.name).locator(cy('row-count'));

    await expect(count).toHaveText(String(world.assetCount - 1));
    await expect(count).toHaveAttribute('title', `Assets: ${world.assetCount - 1}`);
  });

  test('reads availability from c8y_Availability: footer stat, row ring and branch rows', async ({
    page,
    api,
    mock,
    visitApp,
  }) => {
    const device = world.leafDevices[0];

    await makeUnavailable(api, mock, device.id);
    const wasAvailable = world.availableCount - (world.leafDevices[0] ? 1 : 0);

    await openDrawer(page, visitApp);
    const unavailable = page.locator(cy('footer-unavailable'));

    await expect(unavailable).toContainText('1');
    await expect(unavailable).toHaveAttribute(
      'title',
      `1 of ${world.deviceCount} devices are unavailable`
    );
    await page.locator(FILTER).fill(world.leaf.name);
    await expect(rowNamed(page, world.leaf.name).locator(cy('row-status'))).toHaveClass(
      /ps-status-dot--unavailable/
    );

    await hover(page, world.site.name);
    expect(await fieldLabels(page)).toEqual(['Devices', 'Available', 'Unavailable', 'Alarms']);
    await expect(fieldValue(page, 'Devices')).toHaveText(exact(String(world.deviceCount)));
    // the controller was available in the world unless it had no status at all
    await expect(fieldValue(page, 'Available')).toHaveText(
      new RegExp(`^\\s*(${wasAvailable}|${world.availableCount}) of ${world.deviceCount}\\s*$`)
    );
    await expect(fieldValue(page, 'Unavailable')).toHaveText(exact('1'));

    await hover(page, world.leaf.name);
    await expect(fieldValue(page, 'Status')).toContainText('Unavailable');
  });

  test('shows the default fields for a leaf asset', async ({
    page,
    visitApp,
    reviewScreenshot,
  }) => {
    await openDrawer(page, visitApp);
    await hover(page, world.leaf.name);
    expect(await fieldLabels(page)).toEqual(DEFAULT_LABELS);
    await expect(fieldValue(page, 'Type')).toHaveText(exact(world.leaf.type));
    await reviewScreenshot('navigation-and-search/detail-panel');
  });

  test("edits a level's fields in the settings drawer, stores them and keeps them after a reload", async ({
    page,
    visitApp,
  }) => {
    const writes = recordSettingsWrites(page);

    await openDrawer(page, visitApp);
    await hover(page, world.leaf.name);
    // the hover panel no longer configures itself
    await expect(page.locator(`${DETAIL} ${cy('detail-configure')}`)).toHaveCount(0);
    await expect(page.locator(`${DETAIL} ${cy('detail-open')}`)).toBeVisible();

    await openLevel(page, world.leaf.type);
    await expect(page.locator(FIELDCFG)).toBeVisible();
    await expect(page.locator(cy('fieldcfg-inherited'))).toBeVisible();
    await expect(page.locator(cy('fieldcfg-reset'))).toBeDisabled();
    // the preview: an asset of this type, fields only, no actions
    expect(await previewLabels(page)).toEqual(DEFAULT_LABELS);
    await expect(page.locator(`${PREVIEW} ${cy('detail-open')}`)).toHaveCount(0);

    await page
      .locator(
        `${cy('fieldcfg-selected')}[data-field-id="property:c8y_Hardware.serialNumber"] input`
      )
      .click();
    const panel = await savedDetailPanel(writes);

    expect(panel.version).toBe(1);
    expect(panel.types[world.leaf.type].map((field: { label: string }) => field.label)).toEqual(
      DEFAULT_LABELS.filter((label) => label !== 'Serial')
    );
    expect(panel.default.length).toBe(DEFAULT_LABELS.length);
    await expect(page.locator(cy('fieldcfg-inherited'))).toHaveCount(0);
    await expect(levelChip(page, world.leaf.type)).toContainText('Custom');
    expect(await previewLabels(page)).not.toContain('Serial');
    await closeSettings(page);
    await hover(page, world.leaf.name);
    expect(await fieldLabels(page)).not.toContain('Serial');

    await page.reload();
    await page.locator(NAV_NODE).click({ timeout: 60_000 });
    await expect(page.locator(ROW).first()).toBeVisible({ timeout: 30_000 });
    await hover(page, world.leaf.name);
    expect(await fieldLabels(page)).toEqual(DEFAULT_LABELS.filter((label) => label !== 'Serial'));

    // back to the default list for this type
    await openLevel(page, world.leaf.type);
    await expect(page.locator(cy('fieldcfg-reset'))).toBeEnabled();
    await page.locator(cy('fieldcfg-reset')).click();
    expect((await savedDetailPanel(writes)).types).toEqual({});
    expect(await previewLabels(page)).toEqual(DEFAULT_LABELS);
    await closeSettings(page);
    await hover(page, world.leaf.name);
    expect(await fieldLabels(page)).toEqual(DEFAULT_LABELS);
  });

  test("adds a property of the type's assets from the platform's asset property list", async ({
    page,
    visitApp,
  }) => {
    const writes = recordSettingsWrites(page);

    await openDrawer(page, visitApp);
    await openLevel(page, world.leaf.type);
    const getAsset = page.waitForRequest(
      (r) =>
        r.method() === 'GET' &&
        /\/inventory\/managedObjects\/[^/?]+/.test(new URL(r.url()).pathname)
    );

    await page.locator(cy('fieldcfg-add-properties')).click();
    await getAsset;

    // the asset's own fragments are listed (the mock has no DTM model for them), keys shown
    const picker = page.locator(cy('property-picker'));
    const add = page.locator(cy('property-picker-add'));

    await expect(add).toBeDisabled();
    await picker
      .locator('[role="treeitem"]')
      .filter({ hasText: /^\s*owner\s+owner\s/ })
      .first()
      .locator('input[type="checkbox"]')
      .dispatchEvent('click');
    await expect(add).toContainText('(1)');
    await add.click();
    await expect(picker).toHaveCount(0);

    const panel = await savedDetailPanel(writes);
    const fields = panel.types[world.leaf.type] as { label: string; source: { path?: string } }[];

    expect(fields).toHaveLength(DEFAULT_LABELS.length + 1);
    expect(fields.at(-1)).toEqual({ label: 'Owner', source: { kind: 'property', path: 'owner' } });
    expect(await previewLabels(page)).toContain('Owner');
  });

  test("rolls up a number property for a group level and shows it as the group's badge", async ({
    page,
    visitApp,
  }) => {
    const writes = recordSettingsWrites(page);

    await openDrawer(page, visitApp);
    await openLevel(page, world.site.type);
    await expect(page.locator(cy('settings-rollups'))).toBeVisible();
    // the defaults: what a group showed before rollups were configurable
    expect(
      await page
        .locator(cy('rollupcfg-field'))
        .evaluateAll((lis) => lis.map((li) => li.getAttribute('data-rollup-id')))
    ).toEqual([
      'count:units',
      'availability:available',
      'availability:unavailable',
      'alarms:critical,major,minor,warning',
    ]);

    await page.locator(cy('rollupcfg-new')).click();
    await page.locator(cy('rollupcfg-what')).selectOption('property');
    // whichever number property the world's assets carry first
    const path = (await page
      .locator(`${cy('rollupcfg-path')} option`)
      .nth(1)
      .getAttribute('value'))!;

    await page.locator(cy('rollupcfg-path')).selectOption(path);
    await page.locator(cy('rollupcfg-label')).fill('Rolled up');
    await page.locator(cy('rollupcfg-add')).click();
    const fields = (await writes.next()).rollups.types[world.site.type].fields;

    expect(fields).toHaveLength(5);
    expect(fields[4]).toEqual({
      label: 'Rolled up',
      metric: { kind: 'property', path, fn: 'sum' },
    });

    await page.locator(cy('rollupcfg-badge')).selectOption(`property:sum:${path}`);
    expect((await writes.next()).rollups.types[world.site.type].badge).toBe(`property:sum:${path}`);
    expect(await previewLabels(page)).toContain('Rolled up');
    await closeSettings(page);
    await expect(rowNamed(page, world.site.name).locator(cy('row-count'))).toHaveAttribute(
      'title',
      /^Rolled up: /
    );
  });

  test('lists the tree’s types by level and edits the default list', async ({ page, visitApp }) => {
    const writes = recordSettingsWrites(page);

    await openDrawer(page, visitApp);
    await openLevel(page, world.site.type);
    // the root's type is on the first level, the leaf's further down
    await expect(
      page
        .locator(`${cy('settings-levels')} .ps-settings__row`)
        .first()
        .locator(`[data-type="${world.site.type}"]`)
    ).toHaveAttribute('aria-selected', 'true');
    await expect(levelChip(page, world.leaf.type)).toHaveCount(1);

    // the default list
    await page.locator(cy('settings-level-default')).click();
    await expect(page.locator(cy('fieldcfg-scope'))).toContainText('Default for all types');
    await page
      .locator(`${cy('fieldcfg-selected')}[data-field-id="property:c8y_Firmware.version"] input`)
      .click();
    expect((await savedDetailPanel(writes)).default).toHaveLength(DEFAULT_LABELS.length - 1);

    // a type of the tree: its own list starts from the (edited) default
    await levelChip(page, world.leaf.type).click();
    await expect(page.locator(cy('fieldcfg-inherited'))).toBeVisible();
    await page.locator(`${cy('fieldcfg-selected')}[data-field-id="type"] input`).click();
    const panel = await savedDetailPanel(writes);
    const kinds = panel.types[world.leaf.type].map(
      (field: { source: { kind: string } }) => field.source.kind
    );

    expect(kinds).not.toContain('type');
    expect(panel.types[world.leaf.type]).toHaveLength(DEFAULT_LABELS.length - 2);
    await closeSettings(page);

    await hover(page, world.leaf.name);
    expect(await fieldLabels(page)).toEqual([
      'Status',
      'Alarms',
      'Last updated',
      'Model',
      'Serial',
    ]);
  });
});
