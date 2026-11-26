import { expect, test } from './support/fixtures';
import type { APIRequestContext, Page, Request } from '@playwright/test';
import { selectors } from './selectors';
import { shell } from './support/dashboard';

/**
 * Release Notes plugin — runs against the tenant mock (windy-dev world), reset before every test.
 * - Admin: navigator node Settings → Release Notes, list/create/edit/publish/unpublish/delete
 * - Display: right drawer entry opens a modal listing published release notes
 * - Auto-popup: on startup the display modal opens when a release was published
 *   after the last check (localStorage key `c8y_release_notes`)
 *
 * Release notes are events of type `c8y_ReleaseNotes` (with a `published` fragment when
 * published) attached to a managed object of type `c8y_ReleaseNotes`.
 */
const EVENT_TYPE = 'c8y_ReleaseNotes';
const LAST_CHECKED_KEY = 'c8y_release_notes';
const ADMIN_ITEM = '[data-cy="release-notes-admin--item"]';
const MODAL = 'c8y-release-notes-admin-modal';
const DISPLAY_MODAL = 'c8y-release-notes-display-list-modal';
const DISPLAY_ITEM = '[data-cy="release-notes-display--item"]';
const DISPLAY_CLOSE = '[data-cy="release-notes-display--close"]';
const DRAWER_TOGGLE = selectors.headerBar.rightDrawerToggleButton;
const dc = (name: string) => `[data-cy="${name}"]`;

interface SeedNote {
  version: string;
  published: boolean;
  body?: string;
  publicationTime?: string | null;
}

const path = (r: Request) => new URL(r.url()).pathname;
const isEventPost = (r: Request) => r.method() === 'POST' && path(r).endsWith('/event/events');
const isEventPut = (r: Request) => r.method() === 'PUT' && /\/event\/events\/[^/]+$/.test(path(r));
const isEventDelete = (r: Request) =>
  r.method() === 'DELETE' && /\/event\/events\/[^/]+$/.test(path(r));
const isNotesList = (r: Request) =>
  r.method() === 'GET' &&
  path(r).endsWith('/event/events') &&
  new URL(r.url()).searchParams.get('type') === EVENT_TYPE;

let sourceId: string;

/** The page's "now": in a frozen run the browser's `Date` stands a minute after the world's `now`. */
function pageNow(): string {
  const frozen = process.env.C8Y_FROZEN_NOW;

  return new Date(frozen ? new Date(frozen).getTime() + 60_000 : Date.now()).toISOString();
}

async function seedNote(api: APIRequestContext, note: SeedNote): Promise<void> {
  const publicationTime =
    note.publicationTime !== undefined ? note.publicationTime : note.published ? pageNow() : null;
  const event: Record<string, unknown> = {
    type: EVENT_TYPE,
    time: pageNow(),
    text: `Release ${note.version}`,
    source: { id: sourceId },
    [EVENT_TYPE]: {
      version: note.version,
      published: note.published,
      publicationTime,
      body: note.body ?? '',
    },
  };

  if (note.published) event['published'] = {};
  const res = await api.post('/event/events', { data: event });

  expect(res.ok()).toBeTruthy();
}

type VisitApp = (path?: string, options?: object) => Promise<void>;

async function visitAdmin(visitApp: VisitApp): Promise<void> {
  await visitApp('release-notes', { language: 'en', waitFor: dc('release-notes-admin--create') });
}

const adminItem = (page: Page, version: string) =>
  page.locator(`${ADMIN_ITEM}[data-version="${version}"]`);
const status = (page: Page, version: string) =>
  adminItem(page, version).locator(dc('release-notes-admin--status'));
const modalVersion = (page: Page) => page.locator(`${MODAL} input[type="text"]`).first();
const modalBody = (page: Page) => page.locator(`${MODAL} textarea`);
// One locator per alert shown: filter by text, several can be up at once.
const alerts = (page: Page) => shell(page).alerts.messages;
const dangerAlerts = (page: Page) => alerts(page).and(page.locator('.alert-danger'));

/** c8y-li-actions live in a dropdown — open it and click the action. */
async function clickItemAction(
  page: Page,
  version: string,
  action: 'edit' | 'publish' | 'delete'
): Promise<void> {
  await adminItem(page, version)
    .locator(`.dropdown-toggle, ${selectors.listItem.actionsBtn}`)
    .first()
    .click();
  await page
    .locator(dc(`release-notes-admin--${action}`))
    .filter({ visible: true })
    .first()
    .click();
}

async function openDisplayModal(page: Page): Promise<void> {
  await page.locator(DRAWER_TOGGLE).first().click();
  await page.locator(dc('release-notes-menu-item')).click();
}

test.describe('Release notes', () => {
  test.beforeEach(async ({ mock, api }) => {
    await mock.reset();
    const res = await api.post('/inventory/managedObjects', {
      data: { type: EVENT_TYPE, name: 'Release notes source' },
    });

    sourceId = (await res.json()).id;
  });

  test.describe('admin', () => {
    test('adds a "Release Notes" navigator node under Settings that opens the admin list', async ({
      page,
      visitApp,
    }) => {
      await visitApp('', { language: 'en', waitFor: '#navigator' });
      await page.locator(`c8y-navigator-node ${selectors.navigatorNode.label('Settings')}`).click();
      const node = page.locator(
        `c8y-navigator-node ${selectors.navigatorNode.label('Release Notes')}`
      );

      await expect(node).toBeVisible();
      await node.click();
      await expect(page).toHaveURL(/#\/release-notes/);
      await expect(page.locator('c8y-release-notes-admin-list')).toBeVisible();
      await expect(page.locator(dc('release-notes-admin--reload'))).toBeVisible();
    });

    test('shows the empty state when no release notes exist', async ({ page, visitApp }) => {
      await visitAdmin(visitApp);
      const empty = page.locator(dc('release-notes-admin--empty'));

      await expect(empty).toBeVisible();
      await expect(empty).toContainText('No release notes available');
    });

    test('lists published and unpublished release notes with their status', async ({
      page,
      api,
      visitApp,
      reviewScreenshot,
    }) => {
      await seedNote(api, { version: '1.0.0', published: true });
      await seedNote(api, { version: '1.1.0', published: false });
      await visitAdmin(visitApp);

      await expect(page.locator(ADMIN_ITEM)).toHaveCount(2);
      await expect(status(page, '1.1.0')).toContainText('Not published');
      await expect(status(page, '1.0.0')).not.toContainText('Not published');
      await reviewScreenshot('release-notes/admin-list');
    });

    test('reloads the list on demand', async ({ page, api, visitApp }) => {
      await visitAdmin(visitApp);
      await expect(page.locator(dc('release-notes-admin--empty'))).toBeVisible();
      await seedNote(api, { version: '2.0.0', published: false });
      const list = page.waitForRequest(isNotesList);

      await page.locator(dc('release-notes-admin--reload')).click();
      await list;
      await expect(adminItem(page, '2.0.0')).toBeVisible();
    });

    test('creates a published release note via the modal, with markdown preview', async ({
      page,
      visitApp,
      reviewScreenshot,
    }) => {
      await visitAdmin(visitApp);
      await page.locator(dc('release-notes-admin--create')).click();

      await expect(page.locator(MODAL)).toBeVisible();
      await expect(page.locator(dc('release-notes-modal--title'))).toContainText(
        'Create Release Note'
      );
      // version is required
      await expect(page.locator(dc('release-notes-modal--submit'))).toBeDisabled();

      await modalVersion(page).fill('3.0.0');
      // styled checkbox whose input has no box: toggle with a click event
      await page.locator(`${MODAL} input[type="checkbox"]`).dispatchEvent('click');
      await modalBody(page).fill('# Headline\n\nSome **bold** text');

      await page.locator(dc('release-notes-modal--preview-toggle')).click();
      const preview = page.locator(dc('release-notes-modal--preview'));

      await expect(preview).toBeVisible();
      await expect(preview.locator('h1')).toContainText('Headline');
      await expect(preview.locator('strong')).toContainText('bold');
      await reviewScreenshot('release-notes/admin-modal');

      const create = page.waitForRequest(isEventPost);

      await expect(page.locator(dc('release-notes-modal--submit'))).toBeEnabled();
      await page.locator(dc('release-notes-modal--submit')).click();

      const body = (await create).postDataJSON();

      expect(body.type).toBe(EVENT_TYPE);
      expect(body[EVENT_TYPE].version).toBe('3.0.0');
      expect(body[EVENT_TYPE].published).toBe(true);
      expect(typeof body[EVENT_TYPE].publicationTime).toBe('string');
      expect(body[EVENT_TYPE].body).toContain('Some **bold** text');
      expect(body.published).toEqual({});

      await expect(page.locator(MODAL)).toHaveCount(0);
      await expect(alerts(page).filter({ hasText: 'Release 3.0.0 created' })).toBeVisible();
      await expect(status(page, '3.0.0')).not.toContainText('Not published');
    });

    test('cancels the create modal without creating anything', async ({ page, visitApp }) => {
      await visitAdmin(visitApp);
      await page.locator(dc('release-notes-admin--create')).click();
      await modalVersion(page).fill('9.9.9');
      await page.locator(dc('release-notes-modal--cancel')).click();
      await expect(page.locator(MODAL)).toHaveCount(0);
      await expect(page.locator(dc('release-notes-admin--empty'))).toBeVisible();
    });

    test('edits an existing release note', async ({ page, api, visitApp }) => {
      await seedNote(api, { version: '4.0.0', published: false, body: 'old body' });
      await visitAdmin(visitApp);

      await clickItemAction(page, '4.0.0', 'edit');
      await expect(page.locator(dc('release-notes-modal--title'))).toContainText(
        'Edit Release Note'
      );
      await expect(modalVersion(page)).toHaveValue('4.0.0');
      await modalVersion(page).fill('4.0.1');
      await expect(modalBody(page)).toHaveValue('old body');
      await modalBody(page).fill('new body');

      const update = page.waitForRequest(isEventPut);
      const submit = page.locator(dc('release-notes-modal--submit'));

      await expect(submit).toContainText('Update');
      await submit.click();

      const body = (await update).postDataJSON();

      expect(body[EVENT_TYPE].version).toBe('4.0.1');
      expect(body[EVENT_TYPE].body).toBe('new body');
      await expect(alerts(page).filter({ hasText: 'Release 4.0.1 updated' })).toBeVisible();
      await expect(adminItem(page, '4.0.1')).toBeVisible();
      await expect(adminItem(page, '4.0.0')).toHaveCount(0);
    });

    test('publishes and unpublishes a release note', async ({ page, api, visitApp }) => {
      await seedNote(api, { version: '5.0.0', published: false });
      await visitAdmin(visitApp);

      let update = page.waitForRequest(isEventPut);

      await clickItemAction(page, '5.0.0', 'publish');
      expect((await update).postDataJSON().published).toEqual({});
      await expect(alerts(page).filter({ hasText: 'Release note 5.0.0 published' })).toBeVisible();
      await expect(status(page, '5.0.0')).not.toContainText('Not published');

      update = page.waitForRequest(isEventPut);
      await clickItemAction(page, '5.0.0', 'publish');
      expect((await update).postDataJSON().published).toBeNull();
      await expect(
        alerts(page).filter({ hasText: 'Release note 5.0.0 unpublished' })
      ).toBeVisible();
      await expect(status(page, '5.0.0')).toContainText('Not published');
    });

    test('deletes a release note', async ({ page, api, visitApp }) => {
      await seedNote(api, { version: '6.0.0', published: false });
      await visitAdmin(visitApp);

      const del = page.waitForRequest(isEventDelete);

      await clickItemAction(page, '6.0.0', 'delete');
      await del;
      await expect(alerts(page).filter({ hasText: 'Release 6.0.0 deleted' })).toBeVisible();
      await expect(adminItem(page, '6.0.0')).toHaveCount(0);
    });

    test('says that deleting failed when the delete is rejected, and keeps the note', async ({
      page,
      api,
      visitApp,
    }) => {
      await seedNote(api, { version: '6.1.0', published: false });
      await visitAdmin(visitApp);
      await page.route(
        (url) => /\/event\/events\/[^/]+$/.test(url.pathname),
        (route) =>
          route.request().method() === 'DELETE'
            ? route.fulfill({ status: 403, json: {} })
            : route.fallback()
      );

      const del = page.waitForRequest(isEventDelete);

      await clickItemAction(page, '6.1.0', 'delete');
      await del;
      await expect(dangerAlerts(page)).toContainText('Could not delete release note');
      await expect(adminItem(page, '6.1.0')).toHaveCount(1);
    });

    test('shows an error alert when loading release notes fails', async ({ page, visitApp }) => {
      await page.route(
        (url) =>
          url.pathname.endsWith('/event/events') && url.searchParams.get('type') === EVENT_TYPE,
        (route) =>
          route.request().method() === 'GET'
            ? route.fulfill({ status: 500, json: {} })
            : route.fallback()
      );
      await visitAdmin(visitApp);
      await expect(
        alerts(page).filter({ hasText: 'Could not load the release notes' })
      ).toBeVisible();
    });
  });

  test.describe('display', () => {
    test('opens the release notes modal from the right drawer listing only published notes', async ({
      page,
      api,
      visitApp,
      reviewScreenshot,
    }) => {
      await seedNote(api, { version: '7.0.0', published: true, body: 'Published **notes**' });
      await seedNote(api, { version: '7.1.0', published: false, body: 'draft' });
      await visitApp('', { language: 'en', waitFor: '#navigator' });

      await openDisplayModal(page);

      await expect(page.locator(DISPLAY_MODAL)).toBeVisible();
      const items = page.locator(DISPLAY_ITEM);

      await expect(items).toHaveCount(1);
      await expect(items.first()).toContainText('7.0.0');
      await expect(items.first().locator('.release-body strong')).toContainText('notes');
      await reviewScreenshot('release-notes/display-modal');

      await page.locator(DISPLAY_CLOSE).click();
      await expect(page.locator(DISPLAY_MODAL)).toHaveCount(0);
    });

    test('shows the empty state in the display modal when nothing is published', async ({
      page,
      visitApp,
    }) => {
      await visitApp('', { language: 'en', waitFor: '#navigator' });
      await openDisplayModal(page);
      await expect(page.locator(dc('release-notes-display--empty'))).toBeVisible();
    });

    test('records the first visit and pops up newer release notes on the next start', async ({
      page,
      api,
      visitApp,
    }) => {
      // First start: no stored timestamp → it is stored, no modal.
      await visitApp('', { language: 'en', waitFor: '#navigator' });
      await expect
        .poll(() => page.evaluate((key) => typeof localStorage.getItem(key), LAST_CHECKED_KEY))
        .toBe('string');
      await expect(page.locator(DISPLAY_MODAL)).toHaveCount(0);

      // Pretend the last check was long ago, then publish a release.
      await page.evaluate(
        ([key, value]) => localStorage.setItem(key, value),
        [LAST_CHECKED_KEY, JSON.stringify(new Date(2000, 0, 1).toISOString())]
      );
      await seedNote(api, { version: '8.0.0', published: true });

      // same URL → a visit would only change the hash; reload to restart the app
      await page.reload();
      await expect(page.locator(DISPLAY_MODAL).first()).toBeVisible({ timeout: 60_000 });
      await expect(page.locator(DISPLAY_ITEM).first()).toContainText('8.0.0');
      // NOTE: both exports (Admin + Display) register the startup check, so with both
      // plugins installed the popup opens twice — close every instance.
      await page.locator(DISPLAY_CLOSE).last().click();
      await expect(page.locator(DISPLAY_CLOSE))
        .toHaveCount(0, { timeout: 15_000 })
        .catch(async () => {
          await page.locator(DISPLAY_CLOSE).last().click();
        });
      await expect(page.locator(DISPLAY_MODAL)).toHaveCount(0);

      // Last-checked was refreshed by opening the modal → no popup on the next start.
      const check = page.waitForRequest(
        (r) => isNotesList(r) && new URL(r.url()).searchParams.get('pageSize') === '1',
        { timeout: 60_000 }
      );

      await page.reload();
      await check;
      await expect(page.locator('#navigator')).toBeAttached();
      await expect(page.locator(DISPLAY_MODAL)).toHaveCount(0);
    });
  });
});
