/// <reference types="cypress" />
import { IManagedObject } from '@c8y/client';
import { registerTestId } from '../support/utils';
import { C8yAddWidgetDialog, C8yDashboard } from '../support/page-objects';
import { DashboardSelectors, WidgetConfigSelectors } from '../support/selectors';

const CYPRESS_TEST_ID = 'kpi-aggregator-widget-tests';
registerTestId(CYPRESS_TEST_ID);

const WIDGET_ID = 'kpi-aggregator.widget';
const WIDGET = 'c8y-kpi-aggregator-widget';
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

function createDashboard(
  device: IManagedObject,
  config: Record<string, unknown> | null
): Cypress.Chainable<IManagedObject> {
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
  return cy
    .c8yclient((c) =>
      c.inventory.create({
        name: 'KPI Dashboard',
        cy_testId: CYPRESS_TEST_ID,
        c8y_Dashboard: { name: 'KPI Dashboard', icon: 'th', priority: 10000, children },
        [`c8y_Dashboard!device!${device.id}`]: {},
      })
    )
    .then((res) => res.body as IManagedObject);
}

describe('KPI Aggregator Widget', () => {
  let device: IManagedObject;

  before(() => {
    cy.getAuth().login();
    ASSETS.forEach((asset) =>
      cy.c8yclient((c) => c.inventory.create({ ...asset, cy_testId: CYPRESS_TEST_ID }))
    );
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
    cy.createDevice({ name: `KPI Device ${Date.now()}`, cy_testId: CYPRESS_TEST_ID, kpiRun: RUN }).then(
      (d) => (device = d)
    );
  });

  function visitWithConfig(config: Record<string, unknown>) {
    createDashboard(device, { ...DEFAULT_CONFIG, ...config });
    cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', WIDGET);
  }

  it('is offered in the add-widget dialog and toggles config fields by display mode', () => {
    createDashboard(device, null);
    cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', DashboardSelectors.WIDGET_EDIT_READY);
    C8yAddWidgetDialog.openAndSelect('KPI Aggregator Widget');

    cy.get('c8y-kpi-aggregator-widget-config').within(() => {
      // defaults
      cy.get('input[id*="_query_"]').should('have.value', '');
      cy.get('input[id*="_pageSize_"]').should('have.value', '100');
      cy.get('input[id*="_pageLimit_"]').should('have.value', '3');
      cy.get('input[id*="_kpiFragment_"]').should('exist');
      cy.get('input[id*="_color_"]').should('exist');
      cy.get('[id*="_chartLegendPosition_"]').should('not.exist');

      // table: no fragment/group/style fields
      cy.get('select[id*="_display_"]').select('Table');
      cy.get('input[id*="_kpiFragment_"]').should('not.exist');
      cy.get('input[id*="_groupBy_"]').should('not.exist');
      cy.get('input[id*="_color_"]').should('not.exist');
      cy.get('input[id*="_percent_"]').should('not.exist');

      // pie: legend position, no sort/order/color
      cy.get('select[id*="_display_"]').select('Pie Chart: Count Entries');
      cy.get('select[id*="_chartLegendPosition_"]').should('exist');
      cy.get('select[id*="_sort_"]').should('not.exist');
      cy.get('input[id*="_color_"]').should('not.exist');
      cy.get('input[id*="_label_"]').should('not.exist');

      cy.get('select[id*="_display_"]').select('Pie Chart: Aggregate Values');
      cy.get('input[id*="_label_"]').should('exist');
    });
  });

  it('saves the configuration entered in the config form', () => {
    createDashboard(device, null).then((dashboard) =>
      cy.intercept('PUT', `**/inventory/managedObjects/${dashboard.id}`).as('saveDashboard')
    );
    cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', DashboardSelectors.WIDGET_EDIT_READY);
    C8yAddWidgetDialog.openAndSelect('KPI Aggregator Widget');

    cy.get('c8y-kpi-aggregator-widget-config').within(() => {
      cy.get('input[id*="_query_"]').scrollIntoView({ offset: { top: -250, left: 0 } }).type(QUERY, { parseSpecialCharSequences: false });
      // the drawer's sticky "Settings" header overlaps this row, so skip the coverage check
      cy.get('input[id*="_pageSize_"]').clear({ force: true }).type('50', { force: true });
      cy.get('select[id*="_display_"]').scrollIntoView({ offset: { top: -250, left: 0 } }).select('Bar Chart: Count Entries');
      cy.get('input[id*="_kpiFragment_"]').scrollIntoView({ offset: { top: -250, left: 0 } }).type('kpiE2e.lbl');
      cy.get('input[id*="_groupBy_"]').scrollIntoView({ offset: { top: -250, left: 0 } }).type('kpiE2e.grp');
      cy.get('select[id*="_sort_"]').scrollIntoView({ offset: { top: -250, left: 0 } }).select('by Label');
      cy.get('select[id*="_order_"]').scrollIntoView({ offset: { top: -250, left: 0 } }).select('↗️ Ascending');
      cy.get('input[id*="_percent_"]').scrollIntoView({ offset: { top: -250, left: 0 } }).check({ force: true });
      cy.get('input[id*="_runOnLoad_"]').scrollIntoView({ offset: { top: -250, left: 0 } }).check({ force: true });
    });
    cy.get(WidgetConfigSelectors.SAVE).click();
    C8yDashboard.saveLayoutIfVisible();

    cy.wait('@saveDashboard')
      .its('request.body.c8y_Dashboard.children')
      .then((children: Record<string, { config: Record<string, unknown> }>) => {
        const config = Object.values(children)[0].config;
        expect(config).to.deep.include({
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
      });
    // the saved widget runs on load
    cy.get(sel('bar'), { timeout: 30000 }).should('have.length', 4);
  });

  it('waits for a manual trigger when "Run on Load" is off', () => {
    cy.intercept('GET', '**/inventory/managedObjects?*kpiE2e*').as('query');
    visitWithConfig({ runOnLoad: false });

    cy.get(sel('bar')).should('not.exist');
    cy.get(sel('load')).should('be.visible').click();
    cy.wait('@query');
    cy.get(sel('load')).should('not.exist');
    cy.get(sel('bar')).should('have.length', 3);
  });

  it('aggregates numeric KPI values per group, sorted by value descending with percent', () => {
    cy.intercept('GET', '**/inventory/managedObjects?*kpiE2e*').as('query');
    visitWithConfig({ percent: true });

    cy.wait('@query').its('request.url').should('include', 'pageSize=100');
    cy.get(sel('bar')).should('have.length', 3);
    cy.get(sel('bar-label')).then(($l) =>
      expect($l.toArray().map((e) => e.textContent?.trim())).to.deep.equal(['Alpha', 'Beta', 'Gamma'])
    );
    cy.get(sel('bar-value')).eq(0).should('contain.text', '15').and('contain.text', '65.2%');
    cy.get(sel('bar-value')).eq(1).should('contain.text', '7');
    cy.get(sel('bar-value')).eq(2).should('contain.text', '1');
    // meta info
    cy.get(sel('results')).should('contain.text', '5 Results');
    cy.get(sel('duration')).should('contain.text', 'Query duration');
  });

  it('counts entries per group, sorted by label ascending', () => {
    visitWithConfig({
      display: 'count',
      kpiFragment: 'kpiE2e.lbl',
      sort: 'label',
      order: 'asc',
      showMeta: false,
    });

    cy.get(sel('bar')).should('have.length', 4);
    cy.get(sel('bar-label')).then(($l) =>
      expect($l.toArray().map((e) => e.textContent?.trim())).to.deep.equal(['Alpha', 'Beta', 'D', 'Gamma'])
    );
    cy.get(sel('bar-value')).eq(0).should('contain.text', '2');
    cy.get(sel('bar-value')).first().find('.percent').should('not.exist');
    cy.get(sel('results')).should('not.exist');
    cy.get(sel('duration')).should('not.exist');
  });

  it('lists the matching assets in a table sorted by name', () => {
    // the table shows the assets of the first group, so do not group here
    visitWithConfig({ display: 'list', groupBy: '', order: 'asc' });

    cy.get(`${sel('table')} tbody tr`).should('have.length', 5);
    cy.get(`${sel('table')} tbody tr td:first-child`).then(($c) =>
      expect($c.toArray().map((e) => e.textContent?.trim())).to.deep.equal([
        'Alpha-1',
        'Alpha-2',
        'Beta-1',
        'Delta-1',
        'Gamma-1',
      ])
    );
    cy.get(`${sel('table')} tbody tr a`).first().should('have.attr', 'href').and('include', '/device/');
  });

  it('renders a pie chart', () => {
    visitWithConfig({ display: 'pieCount', chartLegendPosition: 'left' });
    cy.get(`${sel('pie')} canvas`).should('be.visible');
  });

  it('resolves [placeholders] in the query from the dashboard context', () => {
    cy.intercept('GET', '**/inventory/managedObjects?*kpiE2e*').as('query');
    visitWithConfig({ query: "kpiE2e.run eq '[kpiRun]'" });

    cy.wait('@query').its('request.url').then((url) => {
      expect(decodeURIComponent(url).replace(/\+/g, ' ')).to.include(QUERY);
    });
    cy.get(sel('bar')).should('have.length', 3);
  });

  it('loads pages up to the page limit and loads the next batch on demand', () => {
    cy.intercept('GET', '**/inventory/managedObjects?*kpiE2e*').as('query');
    visitWithConfig({ display: 'count', pageSize: 2, pageLimit: 1 });

    cy.get(sel('results')).should('contain.text', '2 Results');
    cy.get(sel('paging')).should('contain.text', '(1/1|3)');

    cy.get(sel('menu')).click();
    cy.get(`${WIDGET} [data-cy="kpi-aggregator--load-next"]`).should('be.enabled').click();
    cy.get(sel('results')).should('contain.text', '4 Results');
    cy.get(sel('paging')).should('contain.text', '(2/2|3)');

    // refresh re-runs the query from page one
    cy.get(sel('menu')).click();
    cy.get(sel('refresh')).click();
    cy.get(sel('results')).should('contain.text', '2 Results');
  });

  it('shows the empty state when the query matches nothing', () => {
    visitWithConfig({ query: "kpiE2e.run eq 'does-not-exist'" });
    cy.get(sel('empty')).should('contain.text', 'Empty AssetGroup Result');
  });

  it('shows an error alert when the query fails', () => {
    cy.intercept('GET', '**/inventory/managedObjects?*kpiE2e*', { statusCode: 500, body: {} }).as(
      'queryFail'
    );
    visitWithConfig({});
    cy.wait('@queryFail');
    cy.get('c8y-alert-outlet .alert-danger').should('contain.text', 'Could not load the widget data.');
  });
});
