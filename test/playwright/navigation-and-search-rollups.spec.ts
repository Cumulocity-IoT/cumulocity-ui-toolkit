import { expect, test } from './support/fixtures';
import {
  NAV_NODE,
  ROW,
  FILTER,
  DETAIL,
  FIELD,
  rowNamed,
  openDrawer,
  closeSettings,
  levelChip,
  openLevel,
} from './support/navigation-and-search';
import type { APIRequestContext, Page, Request } from '@playwright/test';

/**
 * Navigation and search — configurable rollups (settings drawer, "By level" tab), on the tenant
 * mock (windy-dev world). Converted from cypress/e2e/navigation-and-search-rollups.cy.ts.
 *
 * Covered:
 *  - a group level starts with the default rollups; a leaf level has none to configure
 *  - adding a count of one asset type, the duplicate warning, choosing the row badge, removing
 *    and reordering a rollup, resetting the level to the default
 *  - the default set, followed by every group type without a set of its own
 *  - a latest-measurement rollup: the tree's own inventory requests then carry
 *    `withLatestValues=true` (only then, also after a reload), no per-device measurement request,
 *    and the badge shows the average of the latest values
 *
 * Names, types and values are read from the inventory at runtime — the world is re-pulled in CI.
 */

const ROLLUPS = '[data-cy="navigation-and-search--settings-rollups"]';
const ROLLUP = '[data-cy="navigation-and-search--rollupcfg-field"]';
const BADGE = '[data-cy="navigation-and-search--row-count"]';

const cfg = (name: string) => `[data-cy="navigation-and-search--rollupcfg-${name}"]`;

const DEFAULT_IDS = [
  'count:units',
  'availability:available',
  'availability:unavailable',
  'alarms:critical,major,minor,warning',
];

interface MO {
  id: string;
  name: string;
  type: string;
  c8y_IsAsset?: object;
  c8y_IsDevice?: object;
  c8y_LatestMeasurements?: Record<string, Record<string, { value: number }>>;
  childAssets?: { references: { managedObject: { id: string } }[] };
}

interface World {
  site: MO;
  /** An asset below the site without child assets: a leaf level. */
  leaf: MO;
  /** The most frequent asset type below the site, and how many assets have it. */
  commonType: string;
  commonCount: number;
  /** A measurement series (`fragment.series`) of the devices below the site, and its average. */
  series: string;
  seriesAverage: number;
}

type Children = (mo: MO) => MO[];

/** The assets below `site` (depth first) and the devices among their children. */
function descendants(site: MO, childrenOf: Children): { assets: MO[]; devices: MO[] } {
  const assets: MO[] = [];
  const devices: MO[] = [];
  const walk = (mo: MO) => {
    for (const child of childrenOf(mo)) {
      if (child.c8y_IsAsset) {
        assets.push(child);
        walk(child);
      } else if (child.c8y_IsDevice) {
        devices.push(child);
      }
    }
  };

  walk(site);

  return { assets, devices };
}

/** The key with the most entries, with those entries. */
function mostFrequent<T>(entries: [string, T][]): [string, T[]] {
  const groups = new Map<string, T[]>();

  for (const [key, value] of entries) groups.set(key, [...(groups.get(key) ?? []), value]);

  return [...groups].sort((a, b) => b[1].length - a[1].length)[0];
}

/** `fragment.series` → latest value, for every series a device reports. */
function latestValues(device: MO): [string, number][] {
  return Object.entries(device.c8y_LatestMeasurements ?? {}).flatMap(([fragment, series]) =>
    Object.entries(series)
      .filter(([, latest]) => typeof latest?.value === 'number')
      .map(([name, latest]): [string, number] => [`${fragment}.${name}`, latest.value])
  );
}

async function readWorld(api: APIRequestContext): Promise<World> {
  const res = await api.get(
    '/inventory/managedObjects?pageSize=2000&withChildren=true&withLatestValues=true'
  );
  const all = (await res.json()).managedObjects as MO[];
  const byId = new Map(all.map((mo) => [mo.id, mo]));
  const childrenOf: Children = (mo) =>
    (mo.childAssets?.references ?? [])
      .map((ref) => byId.get(ref.managedObject.id))
      .filter((child): child is MO => !!child);
  const referenced = new Set(all.flatMap((mo) => childrenOf(mo).map((child) => child.id)));
  const site = all.find((mo) => mo.c8y_IsAsset && !referenced.has(mo.id)) as MO;
  const { assets, devices } = descendants(site, childrenOf);
  const [commonType, ofCommonType] = mostFrequent(assets.map((a): [string, MO] => [a.type, a]));
  // the series most devices report
  const [series, seriesValues] = mostFrequent(devices.flatMap(latestValues));

  return {
    site,
    leaf: assets.find((mo) => !childrenOf(mo).some((child) => !!child.c8y_IsAsset)) as MO,
    commonType,
    commonCount: ofCommonType.length,
    series,
    seriesAverage: seriesValues.reduce((sum, value) => sum + value, 0) / seriesValues.length,
  };
}

async function rollupIds(page: Page): Promise<(string | null)[]> {
  return page
    .locator(ROLLUP)
    .evaluateAll((items) => items.map((li) => li.getAttribute('data-rollup-id')));
}

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

/** The stored rollups, as the awaited settings write sent them. */
async function savedRollups(write: Promise<Request>) {
  return (await write).postDataJSON().customProperties.ps_AssetNavigatorSettings.rollups;
}

const rollupValue = (page: Page, id: string) =>
  page.locator(`${ROLLUP}[data-rollup-id="${id}"] .ps-rollupcfg__value`);

test.describe('Navigation and search — rollups', () => {
  let world: World;
  /** Inventory requests of the run that ask for latest values, and the measurement requests (there must be none). */
  let latestRequests: string[];
  let measurementRequests: string[];

  test.beforeAll(async ({ mock, api }) => {
    await mock.reset();
    world = await readWorld(api);
  });

  test.beforeEach(async ({ mock, page }) => {
    await mock.reset();
    latestRequests = [];
    measurementRequests = [];
    page.on('request', (r) => {
      const url = new URL(r.url());

      if (r.method() !== 'GET') return;

      if (
        url.pathname.includes('/inventory/managedObjects') &&
        url.searchParams.get('withLatestValues') === 'true'
      ) {
        latestRequests.push(r.url());
      }
      // per-device measurement queries only: the shell itself reads single measurements by id
      if (url.pathname.endsWith('/measurement/measurements')) measurementRequests.push(r.url());
    });
  });

  test('offers rollups for group levels only, starting from the defaults', async ({
    page,
    visitApp,
    reviewScreenshot,
  }) => {
    await openDrawer(page, visitApp);
    await openLevel(page, world.site.type);
    await expect(page.locator(ROLLUPS)).toBeVisible();
    await expect(page.locator(cfg('inherited'))).toBeVisible();
    await expect(page.locator(cfg('reset'))).toBeDisabled();
    expect(await rollupIds(page)).toEqual(DEFAULT_IDS);
    await expect(page.locator(cfg('badge'))).toHaveValue('count:units');
    // the sample's values next to the labels
    await expect(rollupValue(page, 'count:units')).toHaveText(/^\d+$/);
    await reviewScreenshot('navigation-and-search/rollups');

    await levelChip(page, world.leaf.type).click();
    await expect(page.locator(ROLLUPS)).toHaveCount(0);
    await expect(page.locator('[data-cy="navigation-and-search--fieldcfg"]')).toBeVisible();
  });

  test('counts assets of one type as the badge, then removes, reorders and resets the level', async ({
    page,
    visitApp,
  }) => {
    const id = `count:assets:${world.commonType}`;

    await openDrawer(page, visitApp);
    await openLevel(page, world.site.type);

    await page.locator(cfg('new')).click();
    await expect(page.locator(cfg('add'))).toBeEnabled();
    await page.locator(cfg('what')).selectOption('count-assets');
    await page.locator(cfg('type')).selectOption(world.commonType);
    await page.locator(cfg('label')).fill('Of the common type');
    let write = nextSettingsWrite(page);

    await page.locator(cfg('add')).click();
    const set = (await savedRollups(write)).types[world.site.type];

    expect(set.fields).toHaveLength(DEFAULT_IDS.length + 1);
    expect(set.fields.at(-1)).toEqual({
      label: 'Of the common type',
      metric: { kind: 'count', of: 'assets', type: world.commonType },
    });
    // the first edit copied the default badge
    expect(set.badge).toBe('count:units');
    await expect(page.locator(cfg('form'))).toHaveCount(0);
    await expect(page.locator(cfg('inherited'))).toHaveCount(0);
    await expect(page.locator(cfg('reset'))).toBeEnabled();
    await expect(rollupValue(page, id)).toHaveText(String(world.commonCount));

    // the same rollup a second time is refused
    await page.locator(cfg('new')).click();
    await page.locator(cfg('what')).selectOption('count-assets');
    await page.locator(cfg('type')).selectOption(world.commonType);
    await expect(page.locator(cfg('duplicate'))).toBeVisible();
    await expect(page.locator(cfg('add'))).toBeDisabled();
    await page.locator(cfg('cancel')).click();
    await expect(page.locator(cfg('form'))).toHaveCount(0);

    write = nextSettingsWrite(page);
    await page.locator(cfg('badge')).selectOption(id);
    expect((await savedRollups(write)).types[world.site.type].badge).toBe(id);
    await expect(page.locator(`${ROLLUP}[data-rollup-id="${id}"]`)).toContainText('Badge');

    write = nextSettingsWrite(page);
    await page
      .locator(`${ROLLUP}[data-rollup-id="availability:unavailable"] ${cfg('remove')}`)
      .click();
    expect((await savedRollups(write)).types[world.site.type].fields).toHaveLength(
      DEFAULT_IDS.length
    );
    expect(await rollupIds(page)).not.toContain('availability:unavailable');

    // drag the first rollup below the second, as a mouse does it: CDK takes mouse events with a
    // pressed button only, and starts dragging after a few pixels
    const items = page.locator(ROLLUP);
    const grip = (await items.nth(0).locator('.ps-rollupcfg__grip').boundingBox())!;
    const target = (await items.nth(1).boundingBox())!;
    const x = grip.x + 4;

    write = nextSettingsWrite(page);
    await page.mouse.move(x, grip.y + 4);
    await page.mouse.down();

    for (const y of [grip.y + 10, grip.y + 16, target.y + 10, target.y + target.height - 2]) {
      await page.mouse.move(x, y);
    }
    await page.mouse.up();
    const reordered = (await savedRollups(write)).types[world.site.type].fields as {
      metric: { kind: string };
    }[];

    expect(reordered.map((field) => field.metric.kind)).toEqual([
      'availability',
      'count',
      'alarms',
      'count',
    ]);

    await closeSettings(page);
    const badge = rowNamed(page, world.site.name).locator(BADGE);

    await expect(badge).toHaveText(String(world.commonCount));
    await expect(badge).toHaveAttribute('title', `Of the common type: ${world.commonCount}`);
    await page.locator(FILTER).fill(world.site.name);
    await rowNamed(page, world.site.name).hover();
    await expect(page.locator(`${DETAIL} ${FIELD} dt`)).toHaveText([
      'Available',
      'Devices',
      'Alarms',
      'Of the common type',
    ]);

    // back to the default rollups
    await page.locator('[data-cy="navigation-and-search--filter-reset"]').click();
    await openLevel(page, world.site.type);
    write = nextSettingsWrite(page);
    await page.locator(cfg('reset')).click();
    expect((await savedRollups(write)).types).toEqual({});
    await expect(page.locator(cfg('inherited'))).toBeVisible();
    expect(await rollupIds(page)).toEqual(DEFAULT_IDS);
    await closeSettings(page);
    await expect(rowNamed(page, world.site.name).locator(BADGE)).toHaveAttribute(
      'title',
      /^Devices: \d+$/
    );
  });

  test('edits the default rollups, which group types without a set of their own follow', async ({
    page,
    visitApp,
  }) => {
    await openDrawer(page, visitApp);
    await openLevel(page, null);
    await expect(page.locator(ROLLUPS)).toBeVisible();
    // the default set is the one being edited, so it is never "inherited"
    await expect(page.locator(cfg('inherited'))).toHaveCount(0);

    await page.locator(cfg('new')).click();
    await page.locator(cfg('what')).selectOption('alarmed-assets');
    await page.locator(cfg('severity-major')).dispatchEvent('click');
    await expect(page.locator(cfg('severity-major'))).not.toBeChecked();
    await expect(page.locator(cfg('label'))).toHaveAttribute('placeholder', 'Assets with alarms');
    let write = nextSettingsWrite(page);

    await page.locator(cfg('add')).click();
    expect((await savedRollups(write)).default.fields.at(-1)).toEqual({
      label: '',
      metric: { kind: 'alarmed', of: 'assets', severities: ['critical'] },
    });

    write = nextSettingsWrite(page);
    await page.locator(cfg('badge')).selectOption('alarmed:assets:critical');
    const rollups = await savedRollups(write);

    expect(rollups.default.badge).toBe('alarmed:assets:critical');
    expect(rollups.types).toEqual({});
    await closeSettings(page);

    // the site has no set of its own: its badge follows the default
    await expect(rowNamed(page, world.site.name).locator(BADGE)).toHaveAttribute(
      'title',
      /^Assets with alarms: \d+$/
    );
  });

  test('rolls up the latest measurements from the tree’s own requests, without per-device requests', async ({
    page,
    visitApp,
  }) => {
    const [fragment, name] = world.series.split('.');

    await openDrawer(page, visitApp);
    // no measurement rollup yet: the tree does not ask for latest values
    expect(latestRequests).toHaveLength(0);

    await openLevel(page, world.site.type);
    await page.locator(cfg('new')).click();
    await page.locator(cfg('what')).selectOption('measurement');
    await expect(page.locator(cfg('add'))).toBeDisabled();
    await page.locator(cfg('series')).fill(world.series);
    await page.locator(cfg('fn')).selectOption('avg');
    await page.locator(cfg('label')).fill('Latest');
    await page.locator(cfg('unit')).fill('u');
    let write = nextSettingsWrite(page);
    // the first measurement rollup sweeps again, now with the latest values
    const latestSweep = page.waitForRequest(
      (r) =>
        r.url().includes('/inventory/managedObjects') && r.url().includes('withLatestValues=true')
    );

    await page.locator(cfg('add')).click();
    expect((await savedRollups(write)).types[world.site.type].fields.at(-1)).toEqual({
      label: 'Latest',
      metric: { kind: 'measurement', series: world.series, fn: 'avg' },
      unit: 'u',
    });
    await latestSweep;

    const id = `measurement:avg:${world.series}`;
    const expected = `${world.seriesAverage.toLocaleString('en-US', { maximumFractionDigits: 1 })} u`;

    await expect(rollupValue(page, id)).toHaveText(expected);
    // now offered as a series of the tree
    await page.locator(cfg('new')).click();
    await page.locator(cfg('what')).selectOption('measurement');
    await expect(
      page.locator(`#psRollupSeriesList option[value="${fragment}.${name}"]`)
    ).toHaveCount(1);
    await page.locator(cfg('cancel')).click();

    write = nextSettingsWrite(page);
    await page.locator(cfg('badge')).selectOption(id);
    await write;
    await closeSettings(page);
    const badge = rowNamed(page, world.site.name).locator(BADGE);

    await expect(badge).toHaveText(expected);
    await expect(badge).toHaveAttribute('title', `Latest: ${expected}`);

    // stored: the first sweep after a reload asks for the latest values right away
    latestRequests.length = 0;
    await page.reload();
    await page.locator(NAV_NODE).click({ timeout: 60_000 });
    await expect(rowNamed(page, world.site.name).locator(BADGE)).toHaveText(expected, {
      timeout: 30_000,
    });
    expect(latestRequests.length).toBeGreaterThan(0);
    expect(measurementRequests, 'measurement requests').toHaveLength(0);

    // without a measurement rollup the next load does not ask for them any more
    await openLevel(page, world.site.type);
    write = nextSettingsWrite(page);
    await page.locator(`${ROLLUP}[data-rollup-id="${id}"] ${cfg('remove')}`).click();
    await write;
    await closeSettings(page);
    latestRequests.length = 0;
    await page.reload();
    await page.locator(NAV_NODE).click({ timeout: 60_000 });
    await expect(page.locator(ROW).first()).toBeVisible({ timeout: 30_000 });
    // the badge went with the rollup
    await expect(rowNamed(page, world.site.name).locator(BADGE)).toHaveCount(0);
    expect(latestRequests).toHaveLength(0);
  });
});
