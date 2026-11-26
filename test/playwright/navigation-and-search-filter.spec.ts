import { expect, test } from './support/fixtures';
import {
  NAV_NODE,
  ROW,
  ROW_NAME,
  FILTER,
  TRIGGER,
  rowNamed,
  openDrawer,
  openSettingsTab,
  closeSettings,
} from './support/navigation-and-search';
import type { APIRequestContext, Page } from '@playwright/test';
import { makeUnavailable, restoreWorld } from './support/availability';

/**
 * Navigation and search — the permanent tree filter (settings drawer, "Tree filter" tab), on the
 * tenant mock (windy-dev world). Converted from cypress/e2e/navigation-and-search-filter.cy.ts. The alarm
 * condition, the bar above the tree and its ✕ are covered in `navigation-and-search-settings.spec.ts`.
 *
 * Covered:
 *  - a property condition: level, property, "is set" and "is" with a value; the tree and its
 *    search follow the filter, the global search still finds the hidden assets; removing the
 *    last condition shows everything again
 *  - groups the filter empties disappear, unless "Hide groups the filter leaves empty" is off
 *  - the tab's on/off switch, kept over a reload either way
 *  - an "unavailable device below" condition
 *
 * Names, types and values are read from the inventory at runtime — the world is re-pulled in CI.
 */

const TAB = '[data-cy="navigation-and-search--settings-tab-filter"]';
const BAR = '[data-cy="navigation-and-search--filter-active"]';
const CONDITION = '[data-cy="navigation-and-search--treefilter-condition"]';
const RESULT = '[data-cy="navigation-and-search--treefilter-result"]';
const tf = (name: string) => `[data-cy="navigation-and-search--treefilter-${name}"]`;

type MO = Record<string, unknown> & {
  id: string;
  name: string;
  type: string;
  c8y_IsAsset?: object;
  c8y_IsDevice?: object;
  childAssets?: { references: { managedObject: { id: string } }[] };
};

interface World {
  /** A string property of the assets of `type` with more than one value, and its common value. */
  property: { type: string; path: string; value: string; kept: MO; hidden: MO; mismatches: number };
  /** A group below the root whose child assets are of `childTypes` only. */
  group: MO;
  childTypes: string[];
  /** Two assets of one type, each with a device of its own. */
  withDevice: [MO & { deviceId: string }, MO & { deviceId: string }];
}

async function loadWorld(api: APIRequestContext): Promise<World> {
  const res = await api.get('/inventory/managedObjects?pageSize=2000&withChildren=true');
  const all = (await res.json()).managedObjects as MO[];
  const byId = new Map(all.map((mo) => [mo.id, mo]));
  const childrenOf = (mo: MO) =>
    (mo.childAssets?.references ?? [])
      .map((ref) => byId.get(ref.managedObject.id))
      .filter((child): child is MO => !!child);
  const isAsset = (mo: MO) => !!mo.c8y_IsAsset;
  const referenced = new Set(all.flatMap((mo) => childrenOf(mo).map((child) => child.id)));
  const site = all.find((mo) => isAsset(mo) && !referenced.has(mo.id)) as MO;
  const below = (mo: MO): MO[] =>
    childrenOf(mo)
      .filter(isAsset)
      .flatMap((child) => [child, ...below(child)]);
  const assets = below(site);

  // the most frequent type, and its first string property with a common value
  const byType = new Map<string, MO[]>();

  for (const asset of assets) byType.set(asset.type, [...(byType.get(asset.type) ?? []), asset]);
  const [type, ofType] = [...byType].sort((a, b) => b[1].length - a[1].length)[0];
  // Fields the platform keeps (each object's own lastUpdated, …) are not properties the filter offers.
  const platformFields = new Set([
    'self',
    'id',
    'name',
    'type',
    'owner',
    'creationTime',
    'lastUpdated',
  ]);
  const path = Object.keys(ofType[0])
    .filter((key) => !platformFields.has(key))
    .sort()
    .find((key) => {
      const values = ofType.map((mo) => mo[key]);
      const distinct = new Set(values).size;

      return values.every((v) => typeof v === 'string') && distinct > 1 && distinct < ofType.length;
    }) as string;
  const counts = new Map<string, number>();

  for (const mo of ofType)
    counts.set(mo[path] as string, (counts.get(mo[path] as string) ?? 0) + 1);
  const [value, matches] = [...counts].sort((a, b) => b[1] - a[1])[0];

  // the group of the first level with the fewest child types
  const groups = childrenOf(site)
    .filter((mo) => isAsset(mo) && childrenOf(mo).some(isAsset))
    .map((mo) => ({
      mo,
      types: [
        ...new Set(
          childrenOf(mo)
            .filter(isAsset)
            .map((c) => c.type)
        ),
      ],
    }))
    .sort((a, b) => a.types.length - b.types.length);

  const withDevice = ofType
    .map((mo) => ({
      ...mo,
      deviceId: childrenOf(mo).find((c) => c.c8y_IsDevice && !isAsset(c))?.id,
    }))
    .filter((mo): mo is MO & { deviceId: string } => !!mo.deviceId);

  return {
    property: {
      type,
      path,
      value,
      kept: ofType.find((mo) => mo[path] === value) as MO,
      hidden: ofType.find((mo) => mo[path] !== value) as MO,
      mismatches: ofType.length - matches,
    },
    group: groups[0].mo,
    childTypes: groups[0].types,
    withDevice: [withDevice[0], withDevice[1]],
  };
}

async function reopenDrawer(page: Page) {
  await page.reload();
  await page.locator(NAV_NODE).click({ timeout: 60_000 });
  await expect(page.locator(ROW).first()).toBeVisible({ timeout: 30_000 });
}

async function openFilterTab(page: Page) {
  await openSettingsTab(page, 'filter');
}

/** The tree's search narrowed to `name`. */
const searchTree = (page: Page, name: string) => page.locator(FILTER).fill(name);

type TreeFilter = Record<string, any> & { conditions: any[] };

/**
 * The settings writes (PUT /user/currentUser with `ps_AssetNavigatorSettings`): the tree also stores recents and
 * the drawer's pin/width on the user. `next()` hands them out in order, like Cypress' aliased waits; `last()` is
 * the most recent one, for steps that save more than once.
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
    /** The stored filter, as the next settings write sends it. */
    next: async (): Promise<TreeFilter> => {
      await expect.poll(() => bodies.length > cursor, { timeout: 15_000 }).toBe(true);

      return bodies[cursor++].treeFilter;
    },
    /** The last stored filter, retried until `check` passes. */
    last: async (check: (filter: TreeFilter) => void) => {
      await expect
        .poll(
          () => {
            const filter = bodies.at(-1)?.treeFilter as TreeFilter | undefined;

            if (!filter) return 'no settings write yet';

            try {
              check(filter);

              return true;
            } catch (e) {
              return String(e);
            }
          },
          { timeout: 15_000 }
        )
        .toBe(true);
      cursor = bodies.length;
    },
  };
}

async function hiddenCount(page: Page): Promise<number> {
  const text = await page.locator(RESULT).textContent();
  const match = /Hides (\d+) of \d+ assets/.exec(text ?? '');

  expect(match, text ?? '').not.toBeNull();

  return Number(match?.[1]);
}

test.describe('Navigation and search — tree filter', () => {
  let world: World;

  test.beforeEach(async ({ mock, api }) => {
    await mock.reset();
    world = await loadWorld(api);
  });

  test.afterEach(async ({ mock }) => {
    await restoreWorld(mock);
  });

  test('keeps the assets of a level whose property matches; the global search still finds the rest', async ({
    page,
    visitApp,
    reviewScreenshot,
  }) => {
    const { type, path, value, kept, hidden, mismatches } = world.property;
    const writes = recordSettingsWrites(page);

    await openDrawer(page, visitApp);
    await openFilterTab(page);
    await expect(page.locator(RESULT)).toContainText('The tree shows all');
    await page.locator(tf('add')).click();
    expect((await writes.next()).conditions).toHaveLength(1);

    await page.locator(tf('level')).selectOption(type);
    expect((await writes.next()).conditions[0].type).toBe(type);
    await page.locator(tf('kind')).selectOption('property');
    expect((await writes.next()).conditions[0].test.kind).toBe('property');
    await page.locator(tf('path')).selectOption(path);
    // a new property starts from one of its own values
    const started = (await writes.next()).conditions[0].test;

    expect(started.path).toBe(path);
    expect(started.op).toBe('equals');
    expect([kept[path], hidden[path]].map(String).concat(String(started.value))).toContain(
      started.value
    );

    // "is set": every asset of the level has the property
    await page.locator(tf('op')).selectOption('exists');
    expect((await writes.next()).conditions[0].test).toEqual({
      kind: 'property',
      path,
      op: 'exists',
    });
    await expect(page.locator(tf('value'))).toHaveCount(0);
    await expect(page.locator(RESULT)).toContainText('Hides 0 of');

    await page.locator(tf('op')).selectOption('equals');
    expect((await writes.next()).conditions[0].test.op).toBe('equals');
    await page.locator(tf('value')).fill(value);
    await page.locator(tf('value')).blur();
    expect((await writes.next()).conditions[0].test).toEqual({
      kind: 'property',
      path,
      op: 'equals',
      value,
    });
    expect(await hiddenCount(page)).toBeGreaterThanOrEqual(mismatches);
    await expect(page.locator(`${TAB} .badge`)).toHaveText('1');
    await reviewScreenshot('navigation-and-search/filter-editor');
    await closeSettings(page);

    await expect(page.locator(BAR)).toHaveText(/Filter on · [1-9]\d* assets hidden/);
    await searchTree(page, kept.name);
    await expect(rowNamed(page, kept.name)).toHaveCount(1);
    await searchTree(page, hidden.name);
    await expect(page.locator(ROW_NAME, { hasText: hidden.name })).toHaveCount(0);

    // the global search is not filtered
    await page.locator(TRIGGER).click();
    await page.locator('[data-cy="asset-search--input"]').fill(hidden.name);
    await expect(
      page.locator('[data-cy="asset-search--result"] .ps-search-result__name', {
        hasText: hidden.name,
      })
    ).toBeVisible({ timeout: 30_000 });
    await page.locator('[data-cy="asset-search--input"]').press('Escape');
    await page.locator('[data-cy="asset-search--input"]').press('Escape');
    await expect(page.locator('[data-cy="asset-search--palette"]')).toHaveCount(0);

    // without conditions the tree shows everything again
    await page.locator('[data-cy="navigation-and-search--filter-edit"]').click();
    await page.locator(tf('remove')).click();
    expect((await writes.next()).conditions).toEqual([]);
    await expect(page.locator(RESULT)).toContainText('The tree shows all');
    await expect(page.locator(`${TAB} .badge`)).toHaveCount(0);
    await closeSettings(page);
    await expect(page.locator(BAR)).toHaveCount(0);
    await searchTree(page, hidden.name);
    await expect(rowNamed(page, hidden.name)).toHaveCount(1);
  });

  test('hides the groups it empties unless told not to, and stays switched off over a reload', async ({
    page,
    visitApp,
  }) => {
    const writes = recordSettingsWrites(page);

    await openDrawer(page, visitApp);
    await openFilterTab(page);

    // every child of the group fails: a property no asset has that value of
    for (const [i, type] of world.childTypes.entries()) {
      await page.locator(tf('add')).click();
      await expect(page.locator(CONDITION)).toHaveCount(i + 1);
      const condition = page.locator(CONDITION).nth(i);

      await condition.locator(tf('level')).selectOption(type);
      await condition.locator(tf('kind')).selectOption('property');
      await expect(condition.locator(tf('op'))).toHaveValue('equals');
      await condition.locator(tf('value')).fill('no such value');
      await condition.locator(tf('value')).blur();
      await expect(condition.locator(tf('value'))).toHaveValue('no such value');
    }
    await expect(page.locator(RESULT)).toContainText('Hides');
    await closeSettings(page);
    await expect(page.locator(BAR)).toBeVisible();
    await searchTree(page, world.group.name);
    await expect(page.locator(ROW_NAME, { hasText: world.group.name })).toHaveCount(0);

    // keep emptied groups
    await page.locator('[data-cy="navigation-and-search--filter-edit"]').click();
    await expect(page.locator(tf('hide-empty'))).toBeChecked();
    await page.locator(tf('hide-empty')).dispatchEvent('click');
    await writes.last((filter) => {
      expect(filter.hideEmpty).toBe(false);
      expect(filter.conditions).toHaveLength(world.childTypes.length);
    });
    await closeSettings(page);
    await searchTree(page, world.group.name);
    await expect(rowNamed(page, world.group.name)).toHaveCount(1);

    // switched off in the tab: conditions kept, faded, the tree complete — also after a reload
    await page.locator('[data-cy="navigation-and-search--filter-edit"]').click();
    await expect(page.locator(tf('enabled'))).toBeChecked();
    await page.locator(tf('enabled')).dispatchEvent('click');
    await writes.last((filter) => expect(filter.enabled).toBe(false));
    await expect(page.locator('.ps-treefilter__list')).toHaveClass(/ps-treefilter__list--off/);
    await expect(page.locator(RESULT)).toContainText('The tree shows all');
    await closeSettings(page);
    await expect(page.locator(BAR)).toHaveCount(0);

    await reopenDrawer(page);
    await expect(page.locator(BAR)).toHaveCount(0);
    await openFilterTab(page);
    await expect(page.locator(tf('enabled'))).not.toBeChecked();
    await expect(page.locator(CONDITION)).toHaveCount(world.childTypes.length);
    await expect(page.locator(tf('hide-empty'))).not.toBeChecked();
    await page.locator(tf('enabled')).dispatchEvent('click');
    await writes.last((filter) => expect(filter.enabled).toBe(true));
    await closeSettings(page);
    await expect(page.locator(BAR)).toBeVisible();

    await page.reload();
    await page.locator(NAV_NODE).click({ timeout: 60_000 });
    await expect(page.locator(BAR)).toBeVisible({ timeout: 30_000 });
  });

  test('keeps the assets of a level with an unavailable device below them', async ({
    page,
    api,
    mock,
    visitApp,
  }) => {
    const [down, up] = world.withDevice;
    const writes = recordSettingsWrites(page);

    await makeUnavailable(api, mock, down.deviceId);
    await openDrawer(page, visitApp);
    await openFilterTab(page);
    await page.locator(tf('add')).click();
    await writes.next();
    await page.locator(tf('level')).selectOption(down.type);
    await writes.next();
    await page.locator(tf('kind')).selectOption('unavailable');
    expect((await writes.next()).conditions).toEqual([
      { type: down.type, test: { kind: 'unavailable' } },
    ]);
    await expect(page.locator(tf('severity'))).toHaveCount(0);
    await closeSettings(page);

    await searchTree(page, down.name);
    await expect(rowNamed(page, down.name)).toHaveCount(1);
    await searchTree(page, up.name);
    await expect(page.locator(ROW_NAME, { hasText: up.name })).toHaveCount(0);
  });
});
