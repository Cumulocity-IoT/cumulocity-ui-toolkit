/// <reference types="cypress" />
import { IManagedObject } from '@c8y/client';
import { registerTestId } from '../support/utils';
import { C8yAddWidgetDialog, C8yDashboard } from '../support/page-objects';
import { DashboardSelectors, WidgetConfigSelectors } from '../support/selectors';

const CYPRESS_TEST_ID = 'energy-consumption-widget-tests';
registerTestId(CYPRESS_TEST_ID);

const WIDGET_ID = 'energy-comsumption.widget';
const WIDGET = 'c8y-energy-consumption-widget';
const TYPE = 'e2e_EnergyMeter';

const BASE_CONFIG = {
  rangeType: 'date',
  displayMode: 'delta',
  defaultRange: '7 days',
  exposeRangeSelect: false,
  type: TYPE,
  fragment: 'e2e_EnergyMeter',
  series: 'E',
  digits: 2,
  barColor: '#ff0000',
  beginAtZero: true,
};

function createDashboard(
  device: IManagedObject,
  config: Record<string, unknown> | null
): Cypress.Chainable<IManagedObject> {
  const children: Record<string, unknown> = {};
  if (config) {
    children['ecw1'] = {
      id: 'ecw1',
      componentId: WIDGET_ID,
      name: WIDGET_ID,
      title: 'Energy',
      config,
      _x: 0,
      _y: 0,
      _width: 12,
      _height: 6,
    };
  }
  return cy
    .c8yclient((c) =>
      c.inventory.create({
        name: 'Energy Dashboard',
        cy_testId: CYPRESS_TEST_ID,
        c8y_Dashboard: { name: 'Energy Dashboard', icon: 'th', priority: 10000, children },
        [`c8y_Dashboard!device!${device.id}`]: {},
      })
    )
    .then((res) => res.body as IManagedObject);
}

describe('Energy Consumption Widget', () => {
  // all tests share one meter device, so each test opens its own dashboard directly
  let device: IManagedObject;

  function visitDashboard(dashboard: IManagedObject, selector: string) {
    cy.visitShellAndWaitForSelector(`device/${device.id}/dashboard/${dashboard.id}`, 'en', selector);
  }

  before(() => {
    cy.getAuth().login();
    cy.createDevice({ name: `Energy Meter ${Date.now()}`, cy_testId: CYPRESS_TEST_ID }).then((d) => {
      device = d;
      // a cumulative meter reading per day for the last 10 days
      for (let i = 10; i >= 0; i--) {
        const time = new Date(Date.now() - i * 24 * 3600 * 1000 - 3600 * 1000).toISOString();
        cy.c8yclient((c) =>
          c.measurement.create({
            source: { id: d.id },
            type: TYPE,
            time,
            e2e_EnergyMeter: { E: { value: 1000 + (10 - i) * 12.345, unit: 'kWh' } },
          })
        );
      }
    });
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  function visitWithConfig(config: Record<string, unknown>) {
    createDashboard(device, {
      ...BASE_CONFIG,
      device: { id: device.id, name: device.name },
      ...config,
    }).then((dashboard) => visitDashboard(dashboard, WIDGET));
  }

  it('is offered in the add-widget dialog with its config form and defaults', () => {
    createDashboard(device, null).then((dashboard) =>
      visitDashboard(dashboard, DashboardSelectors.WIDGET_EDIT_READY)
    );
    C8yAddWidgetDialog.openAndSelect('Energy Consumption Widget');

    cy.get('c8y-energy-consumption-widget-config').within(() => {
      cy.get('select[id*="_rangeType_"] option:selected').should('contain.text', 'By Date Range');
      cy.get('select[id*="_displayMode_"] option:selected').should('contain.text', 'Total');
      cy.get('select[id*="_defaultRange_"] option:selected').should('contain.text', 'Last 7 Days');
      cy.get('input[id*="_digits_"]').should('have.value', '2');
      cy.get('input[id*="_exposeRangeSelect_"]').should('not.be.checked');
      // "Begin Scale at Zero" is only offered in total mode
      cy.get('input[id*="_beginAtZero_"]').should('exist');
      cy.get('select[id*="_displayMode_"]').select('📊 Delta');
      cy.get('input[id*="_beginAtZero_"]').should('not.exist');
      // event range type is not offered (not supported yet)
      cy.get('input[id*="_eventType_"]').should('not.exist');
    });
  });

  it('saves the configuration entered in the config form', () => {
    createDashboard(device, null).then((dashboard) => {
      cy.intercept('PUT', `**/inventory/managedObjects/${dashboard.id}`).as('saveDashboard');
      visitDashboard(dashboard, DashboardSelectors.WIDGET_EDIT_READY);
    });
    C8yAddWidgetDialog.openAndSelect('Energy Consumption Widget');

    cy.get('c8y-energy-consumption-widget-config').within(() => {
      cy.get('select[id*="_displayMode_"]').select('📊 Delta');
      cy.get('select[id*="_defaultRange_"]').select('Last 12 Hours');
      cy.get('input[id*="_exposeRangeSelect_"]').check({ force: true });
      cy.get('input[id*="_type_"]').type(TYPE);
      cy.get('input[id*="_fragment_"]').type('e2e_EnergyMeter');
      cy.get('input[id*="_series_"]').type('E');
      cy.get('input[id*="_digits_"]').clear().type('1');
      cy.get('input[id*="_barColor_"]').type('#00ff00');
    });
    cy.get(WidgetConfigSelectors.SAVE).should('be.enabled').click();
    C8yDashboard.saveLayoutIfVisible();

    cy.wait('@saveDashboard')
      .its('request.body.c8y_Dashboard.children')
      .then((children: Record<string, { config: Record<string, unknown> }>) => {
        const config = Object.values(children)[0].config;
        expect(config).to.deep.include({
          rangeType: 'date',
          displayMode: 'delta',
          defaultRange: '12 hours',
          exposeRangeSelect: true,
          type: TYPE,
          fragment: 'e2e_EnergyMeter',
          series: 'E',
          digits: 1,
          barColor: '#00ff00',
        });
        expect(config).to.have.nested.property('device.id', device.id);
      });
    cy.get(`${WIDGET} canvas`).should('be.visible');
  });

  // Bar values live in a Chart.js canvas whose instance is not reachable from the page,
  // so the rendering tests assert the queries the chart is built from and the canvas itself.
  it('queries one reading per milestone of the default range and renders the bar chart', () => {
    cy.intercept('GET', '**/measurement/measurements?*').as('measurements');
    visitWithConfig({});

    // "7 days" → now + 7 day boundaries
    for (let i = 0; i < 8; i++) {
      cy.wait('@measurements').its('request.query').should('deep.include', {
        source: device.id,
        type: TYPE,
        pageSize: '1',
        revert: 'true',
      });
    }
    cy.get(`${WIDGET} canvas`).should('be.visible');
    cy.get(`${WIDGET} c8y-loading`).should('not.exist');
    cy.get(`${WIDGET} header select`).should('not.exist');
  });

  it('exposes a range select that reloads the data for the chosen range', () => {
    cy.intercept('GET', '**/measurement/measurements?*').as('measurements');
    visitWithConfig({ exposeRangeSelect: true, displayMode: 'total' });

    cy.get(`${WIDGET} header select`).should('be.visible');
    cy.get(`${WIDGET} header select option:selected`).should('contain.text', 'Last 7 Days');
    cy.get(`${WIDGET} canvas`).should('be.visible');

    cy.get('@measurements.all').should('have.length', 8);
    cy.get(`${WIDGET} header select`).select('Last 12 Hours');
    // 12 hours → now + 12 hour boundaries = 13 more requests
    cy.get('@measurements.all').should('have.length', 8 + 13);
    cy.get(`${WIDGET} canvas`).should('be.visible');

    cy.get(`${WIDGET} header select`).select('Last 4 Weeks');
    cy.get('@measurements.all').should('have.length', 8 + 13 + 5);
  });

  it('shows an error alert when the measurements cannot be loaded', () => {
    cy.intercept('GET', '**/measurement/measurements?*', { statusCode: 500, body: {} }).as(
      'measurementsFail'
    );
    visitWithConfig({});

    cy.wait('@measurementsFail');
    cy.get('c8y-alert-outlet .alert-danger').should('contain.text', 'Could not load the measurements.');
    cy.get(`${WIDGET} c8y-loading`).should('not.exist');
  });
});
