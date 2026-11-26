import { expect, test } from './support/fixtures';
import type { APIRequestContext, Locator } from '@playwright/test';
import { DASHBOARD_READY, shell } from './support/dashboard';

/**
 * KPI Aggregator Widget e2e — runs against the tenant mock (windy-dev world).
 * Converted from cypress/e2e/cumulocity-kpi-aggregator-widget-plugin.cy.ts. The assets, the device and the
 * dashboards are created on the mock per test; the mock is reset before every test.
 */

const WIDGET_ID = 'kpi-aggregator.widget';
const WIDGET = 'c8y-kpi-aggregator-widget';
const CONFIG = 'c8y-kpi-aggregator-widget-config';
const sel = (id: string) => `${WIDGET} [data-cy="kpi-aggregator--${id}"]`;

/** Unique marker for the assets of this spec run, so queries only match our own data. */
const RUN = `kpi${Date.now()}`;
const QUERY = `kpiE2e.run eq '${RUN}'`;

const DEFAULT_CONFIG = {
  query: QUERY,
  pageSize: 100,
  pageLimit: 3,
  groupBy: 'kpiE2e.grp',
  label: 'kpiE2e.lbl',
  kpiFragment: 'kpiE2e.val',
  color: '#27b3ce',
  opacity: 30,
  showMeta: true,
  display: 'aggregate',
  sort: 'value',
  order: 'desc',
  percent: false,
  runOnLoad: true,
  parallelRequests: 1,
  chartLegendPosition: 'top',
};

const ASSETS = [
  { name: 'Alpha-1', kpiE2e: { run: RUN, grp: 'A', lbl: 'Alpha', val: 10 } },
  { name: 'Alpha-2', kpiE2e: { run: RUN, grp: 'A', lbl: 'Alpha', val: 5 } },
  { name: 'Beta-1', kpiE2e: { run: RUN, grp: 'B', lbl: 'Beta', val: 7 } },
  { name: 'Gamma-1', kpiE2e: { run: RUN, grp: 'C', lbl: 'Gamma', val: '1' } },
  // not numeric: skipped when aggregating, but counted
  { name: 'Delta-1', kpiE2e: { run: RUN, grp: 'D', val: 'n/a' } },
];

interface MO {
  id: string;
  name: string;
}

type VisitApp = (path?: string, options?: object) => Promise<void>;

async function create(api: APIRequestContext, data: Record<string, unknown>): Promise<MO> {
  const res = await api.post('/inventory/managedObjects', { data });

  expect(res.ok()).toBeTruthy();

  return (await res.json()) as MO;
}

function createDashboard(
  api: APIRequestContext,
  device: MO,
  config: Record<string, unknown> | null
): Promise<MO> {
  const children: Record<string, unknown> = {};

  if (config) {
    children['kpiw1'] = {
      id: 'kpiw1',
      componentId: WIDGET_ID,
      name: WIDGET_ID,
      title: 'KPI',
      config,
      _x: 0,
      _y: 0,
      _width: 12,
      _height: 8,
    };
  }

  return create(api, {
    name: 'KPI Dashboard',
    c8y_Dashboard: { name: 'KPI Dashboard', icon: 'th', priority: 10000, children },
    [`c8y_Dashboard!device!${device.id}`]: {},
  });
}

const texts = async (locator: Locator) => (await locator.allTextContents()).map((t) => t.trim());

test.describe('KPI Aggregator Widget', () => {
  let device: MO;

  test.beforeEach(async ({ mock, api }) => {
    await mock.reset();
    for (const asset of ASSETS) await create(api, asset);
    device = await create(api, { name: `KPI Device ${Date.now()}`, kpiRun: RUN, c8y_IsDevice: {} });
  });

  async function visitWithConfig(
    api: APIRequestContext,
    visitApp: VisitApp,
    config: Record<string, unknown>
  ) {
    await createDashboard(api, device, { ...DEFAULT_CONFIG, ...config });
    await visitApp(`device/${device.id}`, { language: 'en', waitFor: WIDGET });
  }

  const isQuery = (url: URL) =>
    url.pathname.endsWith('/inventory/managedObjects') && url.search.includes('kpiE2e');

  test('is offered in the add-widget dialog and toggles config fields by display mode', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    await createDashboard(api, device, null);
    await visitApp(`device/${device.id}`, { language: 'en', waitFor: DASHBOARD_READY });
    await shell(page).dashboard.addWidget('KPI Aggregator Widget');

    const form = page.locator(CONFIG);

    // defaults
    await expect(form.getByLabel('Query', { exact: true })).toHaveValue('');
    await expect(form.getByLabel('Page Size', { exact: true })).toHaveValue('100');
    await expect(form.getByLabel('Page Limit', { exact: true })).toHaveValue('3');
    await expect(form.getByLabel('KPI Fragment', { exact: true })).toBeAttached();
    await expect(form.getByLabel('Background Color', { exact: true })).toBeAttached();
    await expect(form.getByLabel('Chart Legend Position', { exact: true })).toHaveCount(0);
    await reviewScreenshot('kpi-widget/config');

    // table: no fragment/group/style fields
    await form.getByLabel('Display Mode', { exact: true }).selectOption({ label: 'Table' });
    await expect(form.getByLabel('KPI Fragment', { exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Group by', { exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Background Color', { exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Show Percent', { exact: true })).toHaveCount(0);

    // pie: legend position, no sort/order/color
    await form
      .getByLabel('Display Mode', { exact: true })
      .selectOption({ label: 'Pie Chart: Count Entries' });
    await expect(form.getByLabel('Chart Legend Position', { exact: true })).toBeAttached();
    await expect(form.getByLabel('Sort', { exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Background Color', { exact: true })).toHaveCount(0);
    await expect(form.getByLabel('Label', { exact: true })).toHaveCount(0);

    await form
      .getByLabel('Display Mode', { exact: true })
      .selectOption({ label: 'Pie Chart: Aggregate Values' });
    await expect(form.getByLabel('Label', { exact: true })).toBeAttached();
  });

  test('saves the configuration entered in the config form', async ({ page, api, visitApp }) => {
    const dashboard = await createDashboard(api, device, null);

    await visitApp(`device/${device.id}`, { language: 'en', waitFor: DASHBOARD_READY });
    await shell(page).dashboard.addWidget('KPI Aggregator Widget');

    const form = page.locator(CONFIG);

    await form.getByLabel('Query', { exact: true }).fill(QUERY);
    await form.getByLabel('Page Size', { exact: true }).fill('50');
    await form
      .getByLabel('Display Mode', { exact: true })
      .selectOption({ label: 'Bar Chart: Count Entries' });
    await form.getByLabel('KPI Fragment', { exact: true }).fill('kpiE2e.lbl');
    await form.getByLabel('Group by', { exact: true }).fill('kpiE2e.grp');
    await form.getByLabel('Sort', { exact: true }).selectOption({ label: 'by Label' });
    await form.getByLabel('Order', { exact: true }).selectOption({ label: '↗️ Ascending' });
    await form.getByLabel('Show Percent', { exact: true }).check({ force: true });
    await form.getByLabel('Run on Load', { exact: true }).check({ force: true });

    const saved = page.waitForRequest(
      (req) =>
        req.method() === 'PUT' && req.url().includes(`/inventory/managedObjects/${dashboard.id}`)
    );

    await shell(page).widgetConfig.save();
    await shell(page).dashboard.save();

    const children = (await saved).postDataJSON().c8y_Dashboard.children as Record<
      string,
      { config: Record<string, unknown> }
    >;

    expect(Object.values(children)[0].config).toMatchObject({
      query: QUERY,
      pageSize: 50,
      display: 'count',
      kpiFragment: 'kpiE2e.lbl',
      groupBy: 'kpiE2e.grp',
      sort: 'label',
      order: 'asc',
      percent: true,
      runOnLoad: true,
    });
    // the saved widget runs on load
    await expect(page.locator(sel('bar'))).toHaveCount(4, { timeout: 30_000 });
  });

  test('waits for a manual trigger when "Run on Load" is off', async ({ page, api, visitApp }) => {
    await visitWithConfig(api, visitApp, { runOnLoad: false });

    await expect(page.locator(sel('bar'))).toHaveCount(0);
    const query = page.waitForRequest((req) => isQuery(new URL(req.url())));

    await page.locator(sel('load')).click();
    await query;
    await expect(page.locator(sel('load'))).toHaveCount(0);
    await expect(page.locator(sel('bar'))).toHaveCount(3);
  });

  test('aggregates numeric KPI values per group, sorted by value descending with percent', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    const query = page.waitForRequest((req) => isQuery(new URL(req.url())));

    await visitWithConfig(api, visitApp, { percent: true });

    expect((await query).url()).toContain('pageSize=100');
    await expect(page.locator(sel('bar'))).toHaveCount(3);
    expect(await texts(page.locator(sel('bar-label')))).toEqual(['Alpha', 'Beta', 'Gamma']);
    await expect(page.locator(sel('bar-value')).nth(0)).toContainText('15');
    await expect(page.locator(sel('bar-value')).nth(0)).toContainText('65.2%');
    await expect(page.locator(sel('bar-value')).nth(1)).toContainText('7');
    await expect(page.locator(sel('bar-value')).nth(2)).toContainText('1');
    // meta info
    await expect(page.locator(sel('results'))).toContainText('5 Results');
    await expect(page.locator(sel('duration'))).toContainText('Query duration');
    // the query duration is measured, so it differs between two runs
    await reviewScreenshot('kpi-widget/bars', { mask: [page.locator(sel('duration'))] });
  });

  test('counts entries per group, sorted by label ascending', async ({ page, api, visitApp }) => {
    await visitWithConfig(api, visitApp, {
      display: 'count',
      kpiFragment: 'kpiE2e.lbl',
      sort: 'label',
      order: 'asc',
      showMeta: false,
    });

    await expect(page.locator(sel('bar'))).toHaveCount(4);
    expect(await texts(page.locator(sel('bar-label')))).toEqual(['Alpha', 'Beta', 'D', 'Gamma']);
    await expect(page.locator(sel('bar-value')).nth(0)).toContainText('2');
    await expect(page.locator(sel('bar-value')).first().locator('.percent')).toHaveCount(0);
    await expect(page.locator(sel('results'))).toHaveCount(0);
    await expect(page.locator(sel('duration'))).toHaveCount(0);
  });

  test('lists the matching assets in a table sorted by name', async ({
    page,
    api,
    visitApp,
    reviewScreenshot,
  }) => {
    // the table shows the assets of the first group, so do not group here
    await visitWithConfig(api, visitApp, { display: 'list', groupBy: '', order: 'asc' });

    const rows = page.locator(`${sel('table')} tbody tr`);

    await expect(rows).toHaveCount(5);
    expect(await texts(page.locator(`${sel('table')} tbody tr td:first-child`))).toEqual([
      'Alpha-1',
      'Alpha-2',
      'Beta-1',
      'Delta-1',
      'Gamma-1',
    ]);
    await expect(page.locator(`${sel('table')} tbody tr a`).first()).toHaveAttribute(
      'href',
      /\/device\//
    );
    await reviewScreenshot('kpi-widget/list', { mask: [page.locator(sel('duration'))] });
  });

  test('renders a pie chart', async ({ page, api, visitApp, reviewScreenshot }) => {
    await visitWithConfig(api, visitApp, { display: 'pieCount', chartLegendPosition: 'left' });
    await expect(page.locator(`${sel('pie')} canvas`)).toBeVisible();
    await reviewScreenshot('kpi-widget/pie', { mask: [page.locator(sel('duration'))] });
  });

  test('resolves [placeholders] in the query from the dashboard context', async ({
    page,
    api,
    visitApp,
  }) => {
    const query = page.waitForRequest((req) => isQuery(new URL(req.url())));

    await visitWithConfig(api, visitApp, { query: "kpiE2e.run eq '[kpiRun]'" });

    expect(decodeURIComponent((await query).url()).replace(/\+/g, ' ')).toContain(QUERY);
    await expect(page.locator(sel('bar'))).toHaveCount(3);
  });

  test('loads pages up to the page limit and loads the next batch on demand', async ({
    page,
    api,
    visitApp,
  }) => {
    await visitWithConfig(api, visitApp, { display: 'count', pageSize: 2, pageLimit: 1 });

    await expect(page.locator(sel('results'))).toContainText('2 Results');
    await expect(page.locator(sel('paging'))).toContainText('(1/1|3)');

    await page.locator(sel('menu')).click();
    const next = page.locator(`${WIDGET} [data-cy="kpi-aggregator--load-next"]`);

    await expect(next).toBeEnabled();
    await next.click();
    await expect(page.locator(sel('results'))).toContainText('4 Results');
    await expect(page.locator(sel('paging'))).toContainText('(2/2|3)');

    // refresh re-runs the query from page one
    await page.locator(sel('menu')).click();
    await page.locator(sel('refresh')).click();
    await expect(page.locator(sel('results'))).toContainText('2 Results');
  });

  test('shows the empty state when the query matches nothing', async ({ page, api, visitApp }) => {
    await visitWithConfig(api, visitApp, { query: "kpiE2e.run eq 'does-not-exist'" });
    await expect(page.locator(sel('empty'))).toContainText('Empty AssetGroup Result');
  });

  test('shows an error alert when the query fails', async ({ page, api, visitApp }) => {
    await page.route(
      (url) => isQuery(url),
      (route) => route.fulfill({ status: 500, json: {} })
    );
    const failed = page.waitForResponse(
      (res) => isQuery(new URL(res.url())) && res.status() === 500
    );

    await visitWithConfig(api, visitApp, {});
    await failed;
    await expect(shell(page).alerts.messages.and(page.locator('.alert-danger'))).toContainText(
      'Could not load the widget data.'
    );
  });
});
