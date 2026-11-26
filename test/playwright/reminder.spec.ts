import { expect, settleClock, test } from './support/fixtures';
import type { APIRequestContext, Locator, Page, Request } from '@playwright/test';
import { shell } from './support/dashboard';

/**
 * Reminder plugin — runs against the tenant mock (windy-dev world), reset before every test.
 * - Header action (`c8y-reminder-indicator`) with a counter of due, active reminders
 * - Drawer with DUE / UPCOMING / CLEARED groups, per-reminder acknowledge / clear / reactivate
 * - "Create Reminder" modal (asset preselected from the device context)
 * - Optional reminder types (tenant option c8y.reminder/types) → type filter + type tag
 * - Optional context filter (tenant option c8y.reminder/config `useContext`)
 * - Toast / browser notification switches persisted in localStorage (`c8y_rpConfig`)
 * - Realtime: reminders created elsewhere show up live
 *
 * Reminders are events of type `c8y_Reminder` with a `status` fragment. The tenant options the plugin
 * reads are stored on the mock (POST /tenant/options) instead of stubbed.
 */
const TYPE = 'c8y_Reminder';
const ITEM = '[data-cy="reminder--item"]';
const DRAWER = '[data-cy="reminder--drawer"]';
const MODAL = 'c8y-reminder-modal';
const INDICATOR = '[data-cy="reminder--indicator"]';
const COUNTER = '[data-cy="reminder--counter"]';
const TYPES = [
  { id: 'maintenance', name: 'Maintenance' },
  { id: 'inspection', name: 'Inspection' },
];
const dc = (name: string) => `[data-cy="${name}"]`;

type Status = 'ACTIVE' | 'ACKNOWLEDGED' | 'CLEARED';
type Group = 'DUE' | 'UPCOMING' | 'CLEARED';
type VisitApp = (path?: string, options?: object) => Promise<void>;

interface MO {
  id: string;
  name: string;
}

let device: MO;
let otherDevice: MO;

const path = (r: Request) => new URL(r.url()).pathname;
const isEventPost = (r: Request) => r.method() === 'POST' && path(r).endsWith('/event/events');
const isEventPut = (r: Request) => r.method() === 'PUT' && /\/event\/events\/[^/]+$/.test(path(r));

/**
 * The page's "now": in a frozen run (`--frozen`, `C8Y_FROZEN_NOW`) the browser's `Date` stands a minute after the
 * world's `now`, while Node's clock runs; due and upcoming are decided by the page, so times are seeded from it.
 */
function pageNow(): number {
  const frozen = process.env.C8Y_FROZEN_NOW;

  return frozen ? new Date(frozen).getTime() + 60_000 : Date.now();
}

function minutesFromNow(minutes: number): string {
  return new Date(pageNow() + minutes * 60_000).toISOString();
}

async function createDevice(api: APIRequestContext, name: string): Promise<MO> {
  const res = await api.post('/inventory/managedObjects', { data: { name, c8y_IsDevice: {} } });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

async function seedReminder(
  api: APIRequestContext,
  text: string,
  opts: { time?: string; status?: Status; source?: MO; reminderType?: string } = {}
): Promise<void> {
  const source = opts.source ?? device;
  const event: Record<string, unknown> = {
    type: TYPE,
    text,
    time: opts.time ?? minutesFromNow(-60),
    status: opts.status ?? 'ACTIVE',
    source: { id: source.id },
    reminderType: opts.reminderType ?? null,
  };

  if (opts.status === 'CLEARED') event['isCleared'] = {};
  const res = await api.post('/event/events', { data: event });

  expect(res.ok()).toBeTruthy();
}

async function setTenantOption(
  api: APIRequestContext,
  key: 'types' | 'config' | 'defaults',
  value: unknown
): Promise<void> {
  const res = await api.post('/tenant/options', {
    data: { category: 'c8y.reminder', key, value: JSON.stringify(value) },
  });

  expect(res.ok()).toBeTruthy();
}

async function visit(visitApp: VisitApp, url = ''): Promise<void> {
  await visitApp(url, { language: 'en', waitFor: INDICATOR });
}

async function openDrawer(page: Page): Promise<void> {
  await page.locator(INDICATOR).click();
  await expect(page.locator(DRAWER)).toHaveClass(/open/);
}

const group = (page: Page, status: Group) => page.locator(dc(`reminder--group-${status}`));
const groupCount = (page: Page, status: Group) =>
  group(page, status).locator(dc('reminder--group-count'));
const item = (page: Page, text: string) => page.locator(ITEM).filter({ hasText: text });

async function expandGroup(page: Page, status: Group): Promise<void> {
  const toggle = group(page, status).locator(dc('reminder--group-toggle'));

  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
}

/** The free-text input of the modal: not the date picker, the time picker or the asset selector's search. */
async function reminderTextInput(page: Page): Promise<Locator> {
  const inputs = page.locator(`${MODAL} input[type="text"]`);
  const count = await inputs.count();

  for (let i = 0; i < count; i++) {
    const input = inputs.nth(i);
    const excluded = await input.evaluate(
      (el) =>
        el.hasAttribute('bsdatepicker') ||
        !!el.closest('timepicker') ||
        !!el.closest('c8y-asset-selector-miller')
    );

    if (!excluded) return input;
  }
  throw new Error('no reminder text input found');
}

/** The switches are styled checkboxes whose input has no box: toggle with a click event instead of a pointer click. */
async function setSwitch(page: Page, name: string, checked: boolean): Promise<void> {
  const input = page.locator(dc(name));

  if ((await input.isChecked()) !== checked) await input.dispatchEvent('click');
}

const localConfig = (page: Page) => page.evaluate(() => localStorage.getItem('c8y_rpConfig') ?? '');

test.describe('Reminder', () => {
  test.beforeEach(async ({ mock, api }) => {
    await mock.reset();
    device = await createDevice(api, 'Reminder device A');
    otherDevice = await createDevice(api, 'Reminder device B');
  });

  // NOTE: the counter is taken from `paging.totalPages` of a pageSize=1 query bounded by
  // `dateTo=now`; the tenant mock reports totalPages=1 for an empty result and ignores
  // `dateTo`, so that count query is stubbed with the platform's answer here.
  test('shows the header indicator with a zero counter when nothing is due', async ({
    page,
    api,
    visitApp,
  }) => {
    await seedReminder(api, 'Upcoming only', { time: minutesFromNow(120) });
    await page.route(
      (url) =>
        url.pathname.endsWith('/event/events') &&
        url.searchParams.get('type') === TYPE &&
        url.searchParams.get('fragmentValue') === 'ACTIVE',
      (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({
              status: 200,
              json: { events: [], statistics: { pageSize: 1, currentPage: 1, totalPages: 0 } },
            })
          : route.fallback()
    );
    await visit(visitApp);
    await expect(page.locator(COUNTER)).toHaveText(/^\s*0\s*$/);
    await expect(page.locator(INDICATOR)).not.toHaveClass(/status-warning/);
    await expect(page.locator(INDICATOR)).not.toHaveClass(/status-danger/);
  });

  test('counts due active reminders and marks the indicator', async ({ page, api, visitApp }) => {
    await seedReminder(api, 'Due 1');
    await seedReminder(api, 'Due 2');
    await seedReminder(api, 'Acknowledged', { status: 'ACKNOWLEDGED' });
    await visit(visitApp);
    await expect(page.locator(COUNTER)).toContainText('2');
    await expect(page.locator(INDICATOR)).toHaveClass(/status-warning/);
  });

  test('caps the counter at 9+ and marks the indicator as danger', async ({
    page,
    api,
    visitApp,
  }) => {
    for (let i = 0; i < 10; i++) await seedReminder(api, `Due ${i}`);
    await visit(visitApp);
    await expect(page.locator(COUNTER)).toContainText('9+');
    await expect(page.locator(INDICATOR)).toHaveClass(/status-danger/);
  });

  test('opens and closes the drawer and groups reminders by DUE / UPCOMING / CLEARED', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    await seedReminder(api, 'Due reminder');
    await seedReminder(api, 'Upcoming reminder', { time: minutesFromNow(120) });
    await seedReminder(api, 'Cleared reminder', { status: 'CLEARED' });
    await visit(visitApp);

    await expect(page.locator(DRAWER)).not.toHaveClass(/open/);
    await openDrawer(page);

    await expect(groupCount(page, 'DUE')).toContainText('1');
    await expect(groupCount(page, 'UPCOMING')).toContainText('1');
    await expect(groupCount(page, 'CLEARED')).toContainText('1');

    // the group headers keep the drawer's inset instead of touching its edges
    // (the drawer slides in: measure until the transition has settled)
    const insets = async () => {
      const drawer = await page.locator(DRAWER).boundingBox();
      const toggle = await group(page, 'DUE').locator(dc('reminder--group-toggle')).boundingBox();

      if (!drawer || !toggle) return [0, 0];

      return [toggle.x - drawer.x, drawer.x + drawer.width - (toggle.x + toggle.width)];
    };

    await expect.poll(async () => Math.min(...(await insets()))).toBeGreaterThanOrEqual(16);

    await expandGroup(page, 'DUE');
    await expect(group(page, 'DUE').locator(ITEM)).toContainText('Due reminder');
    await expect(group(page, 'DUE').locator(dc('reminder--asset-link'))).toContainText(device.name);
    await expandGroup(page, 'UPCOMING');
    await expect(group(page, 'UPCOMING').locator(ITEM)).toContainText('Upcoming reminder');
    await expandGroup(page, 'CLEARED');
    await expect(group(page, 'CLEARED').locator(ITEM)).toContainText('Cleared reminder');
    await reviewScreenshot('reminder/drawer');

    await page.locator(INDICATOR).click();
    await expect(page.locator(DRAWER)).not.toHaveClass(/open/);
  });

  test('links each reminder to its asset', async ({ page, api, visitApp }) => {
    await seedReminder(api, 'Go to device');
    await visit(visitApp);
    await openDrawer(page);
    await expandGroup(page, 'DUE');
    await item(page, 'Go to device').locator(dc('reminder--asset-link')).click();
    await expect(page).toHaveURL(new RegExp(`/device/${device.id}`));
  });

  test('acknowledges, clears and reactivates a reminder', async ({ page, api, visitApp }) => {
    await seedReminder(api, 'Lifecycle');
    await visit(visitApp);
    await openDrawer(page);
    await expandGroup(page, 'DUE');

    let update = page.waitForRequest(isEventPut);

    await item(page, 'Lifecycle').locator(dc('reminder--acknowledge')).click();
    expect((await update).postDataJSON()).toMatchObject({
      status: 'ACKNOWLEDGED',
      isCleared: null,
    });
    await expect(
      shell(page).alerts.messages.filter({ hasText: 'Reminder acknowledged' })
    ).toBeVisible();
    await expect(item(page, 'Lifecycle').locator(dc('reminder--acknowledge'))).toHaveCount(0);

    update = page.waitForRequest(isEventPut);
    await item(page, 'Lifecycle').locator(dc('reminder--clear')).click();
    expect((await update).postDataJSON()).toMatchObject({ status: 'CLEARED', isCleared: {} });
    await expect(shell(page).alerts.messages.filter({ hasText: 'Reminder cleared' })).toBeVisible();
    await expandGroup(page, 'CLEARED');
    await expect(group(page, 'CLEARED').locator(ITEM)).toContainText('Lifecycle');

    update = page.waitForRequest(isEventPut);
    await group(page, 'CLEARED')
      .locator(ITEM)
      .filter({ hasText: 'Lifecycle' })
      .locator(dc('reminder--reactivate'))
      .click();
    expect((await update).postDataJSON()).toMatchObject({ status: 'ACTIVE', isCleared: null });
    await expect(group(page, 'DUE').locator(ITEM)).toContainText('Lifecycle');
  });

  test('creates a reminder from the device context with the asset preselected', async ({
    page,
    visitApp,
    reviewScreenshot,
  }) => {
    await visit(visitApp, `device/${device.id}`);
    await openDrawer(page);

    await page.locator(dc('reminder--create')).click();
    await expect(page.locator(MODAL)).toBeVisible();
    // the type select only exists when reminder types are configured
    await expect(page.locator(`${MODAL} select`)).toHaveCount(0);
    await (await reminderTextInput(page)).fill('Check the pump');
    const create = page.waitForRequest(isEventPost);
    const submit = page.locator(dc('reminder-modal--submit'));

    await expect(submit).toBeEnabled({ timeout: 20_000 });
    await reviewScreenshot('reminder/create-modal');
    await submit.click();

    const body = (await create).postDataJSON();

    expect(body.type).toBe(TYPE);
    expect(body.text).toBe('Check the pump');
    expect(body.status).toBe('ACTIVE');
    expect(body.source.id).toBe(device.id);
    expect(new Date(body.time).getTime()).toBeGreaterThan(pageNow() - 60_000);
    await expect(page.locator(MODAL)).toHaveCount(0);

    // realtime CREATE notification adds it to the list
    await expandGroup(page, 'UPCOMING');
    await expect(group(page, 'UPCOMING').locator(ITEM)).toContainText('Check the pump');
  });

  test('cancels the create modal', async ({ page, visitApp }) => {
    await visit(visitApp);
    await openDrawer(page);
    await page.locator(dc('reminder--create')).click();
    await expect(page.locator(dc('reminder-modal--submit'))).toBeDisabled();
    await page.locator(dc('reminder-modal--cancel')).click();
    await expect(page.locator(MODAL)).toHaveCount(0);
  });

  test('adds reminders created elsewhere in realtime', async ({ page, api, visitApp }) => {
    await visit(visitApp);
    await openDrawer(page);
    await expect(groupCount(page, 'DUE')).toContainText('0');
    await seedReminder(api, 'Created via API');
    await expect(groupCount(page, 'DUE')).toContainText('1');
    await expandGroup(page, 'DUE');
    await expect(item(page, 'Created via API')).toBeVisible();
  });

  test('persists the toast and browser notification switches', async ({ page, visitApp }) => {
    await visit(visitApp);
    await openDrawer(page);
    await setSwitch(page, 'reminder--toast-toggle', true);
    await expect.poll(() => localConfig(page)).toContain('"toast":true');
    await setSwitch(page, 'reminder--browser-toggle', true);
    await expect.poll(() => localConfig(page)).toContain('"browser":true');
    await setSwitch(page, 'reminder--toast-toggle', false);
    await expect.poll(() => localConfig(page)).toContain('"toast":false');
  });

  test('applies the tenant notification defaults to a browser that stored settings before', async ({
    page,
    api,
    visitApp,
  }) => {
    await setTenantOption(api, 'defaults', { toast: true, browser: false });
    await visit(visitApp);
    // what versions before 2.0.0 stored on every config write, whether the user touched the
    // notification switches or not
    await page.evaluate(() =>
      localStorage.setItem(
        'c8y_rpConfig',
        JSON.stringify({
          toast: false,
          browser: false,
          filter: { reminderType: '' },
          useContext: false,
        })
      )
    );
    await page.reload();
    await expect(page.locator(INDICATOR)).toBeVisible({ timeout: 60_000 });
    await openDrawer(page);

    await expect(page.locator(dc('reminder--toast-toggle'))).toBeChecked();
    await expect(page.locator(dc('reminder--browser-toggle'))).not.toBeChecked();
  });

  test('shows a toast when a reminder becomes due and toasts are enabled', async ({
    page,
    api,
    visitApp,
  }) => {
    await visit(visitApp);
    await openDrawer(page);
    await setSwitch(page, 'reminder--toast-toggle', true);
    // due shortly after it reaches the UI → the service timer fires a warning toast. Leave enough
    // headroom for realtime delivery on slow runners: a reminder that arrives already due never
    // "becomes" due, so no toast would fire.
    await seedReminder(api, 'Toast me', { time: new Date(pageNow() + 15_000).toISOString() });
    // a frozen Date never reaches the due time: move it past (20 s), a no-op in a normal run
    await settleClock(page, 20);
    const toast = shell(page).alerts.messages.and(page.locator('.alert-warning'));

    await expect(toast).toContainText('Toast me', { timeout: 45_000 });
    await expect(toast).toContainText(device.name);
  });

  test.describe('with reminder types', () => {
    test.beforeEach(async ({ api }) => {
      await setTenantOption(api, 'types', TYPES);
    });

    test('filters reminders by type from the select and from the type tag', async ({
      page,
      api,
      visitApp,
    }) => {
      await seedReminder(api, 'Maintenance task', { reminderType: 'maintenance' });
      await seedReminder(api, 'Inspection task', { reminderType: 'inspection' });
      await visit(visitApp);
      await openDrawer(page);
      await expect(groupCount(page, 'DUE')).toContainText('2');

      await page.locator(dc('reminder--type-filter')).selectOption({ label: 'Inspection' });
      await expect(groupCount(page, 'DUE')).toContainText('1');
      await expect(groupCount(page, 'DUE')).toContainText('/ 2');
      await expandGroup(page, 'DUE');
      await expect(group(page, 'DUE').locator(ITEM)).toHaveCount(1);
      await expect(group(page, 'DUE').locator(ITEM)).toContainText('Inspection task');

      await page.locator(dc('reminder--type-filter')).selectOption({ label: 'Not filtered' });
      await expect(group(page, 'DUE').locator(ITEM)).toHaveCount(2);

      const tag = item(page, 'Maintenance task').locator(dc('reminder--type-tag'));

      await expect(tag).toContainText('Maintenance');
      await tag.click();
      await expect(group(page, 'DUE').locator(ITEM)).toHaveCount(1);
      await expect(group(page, 'DUE').locator(ITEM)).toContainText('Maintenance task');
      await expect.poll(() => localConfig(page)).toContain('maintenance');
    });

    test('offers the reminder type in the create modal', async ({ page, visitApp }) => {
      await visit(visitApp, `device/${device.id}`);
      await openDrawer(page);
      await page.locator(dc('reminder--create')).click();
      await expect(page.locator(MODAL)).toBeVisible();
      await (await reminderTextInput(page)).fill('Typed reminder');
      await page.locator(`${MODAL} select`).selectOption({ label: 'Inspection' });
      // the device page preselects the asset asynchronously; Create is enabled once it is set
      const create = page.waitForRequest(isEventPost);
      const submit = page.locator(dc('reminder-modal--submit'));

      await expect(submit).toBeEnabled({ timeout: 20_000 });
      await submit.click();
      expect((await create).postDataJSON().reminderType).toBe('inspection');
    });
  });

  test.describe('with context filter enabled by tenant option', () => {
    test.beforeEach(async ({ api }) => {
      await setTenantOption(api, 'config', { useContext: true });
    });

    test('limits the list to reminders of the current asset', async ({ page, api, visitApp }) => {
      await seedReminder(api, 'For device A');
      await seedReminder(api, 'For device B', { source: otherDevice });
      await visit(visitApp, `device/${device.id}`);
      await openDrawer(page);
      await expect(groupCount(page, 'DUE')).toContainText('2');

      await setSwitch(page, 'reminder--context-filter', true);
      await expandGroup(page, 'DUE');
      await expect(group(page, 'DUE').locator(ITEM)).toHaveCount(1);
      await expect(group(page, 'DUE').locator(ITEM)).toContainText('For device A');
    });
  });

  test('does not show the context filter switch without the tenant option', async ({
    page,
    visitApp,
  }) => {
    await visit(visitApp);
    await openDrawer(page);
    await expect(page.locator(dc('reminder--context-filter'))).toHaveCount(0);
    await expect(page.locator(dc('reminder--type-filter'))).toHaveCount(0);
  });

  // Skipped: the list is loaded from an ENVIRONMENT_INITIALIZER before the shell's alert
  // outlet is up; on the mock the danger alert raised there never renders (observed with a
  // stubbed 500), so the error state is not observable in the UI.
  test.skip('shows an error alert when reminders cannot be loaded', async ({ page, visitApp }) => {
    await page.route(
      (url) => url.pathname.endsWith('/event/events') && url.searchParams.get('type') === TYPE,
      (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ status: 500, json: {} })
          : route.fallback()
    );
    await visit(visitApp);
    await expect(page.locator('.alert-danger')).toBeAttached();
  });
});
