/// <reference types="cypress" />
import { IManagedObject } from '@c8y/client';
import { openWidgetForEditing, saveWidgetAndDashboard } from '@cumulocity-iot/ui-sdk/cypress';

const WIDGET_ID = 'windy.kpi-trend';
const WIDGET = 'ps-kpi-trend-widget';
const FRAGMENT = 'e2e_Temperature';
const SERIES = 'T';
const UNIT = '°C';
/** The newest of the seeded measurements, so the value the widget shows. */
const CURRENT = 72;
/** One measurement every 5 minutes over the last hour, rising towards CURRENT. */
const HISTORY = [60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, CURRENT];

function datapoint(device: IManagedObject, extra: Record<string, unknown> = {}) {
  return {
    __active: true,
    __target: { id: device.id, name: device.name },
    fragment: FRAGMENT,
    series: SERIES,
    label: 'Generator temperature',
    unit: UNIT,
    min: 0,
    max: 100,
    color: '#1776bf',
    ...extra,
  };
}

function createDashboard(
  device: IManagedObject,
  config: Record<string, unknown>
): Cypress.Chainable<IManagedObject> {
  return cy
    .c8yclient((c) =>
      c.inventory.create({
        name: 'KPI Trend Dashboard',
        c8y_Dashboard: {
          name: 'KPI Trend Dashboard',
          icon: 'th',
          priority: 10000,
          children: {
            kt1: {
              id: 'kt1',
              componentId: WIDGET_ID,
              name: WIDGET_ID,
              title: 'KPI trend',
              config,
              _x: 0,
              _y: 0,
              _width: 5,
              _height: 4,
            },
          },
        },
        [`c8y_Dashboard!device!${device.id}`]: {},
      })
    )
    .then((res) => res.body as IManagedObject);
}

describe('KPI Trend Widget', () => {
  let device: IManagedObject;

  function visitWithConfig(config: Record<string, unknown>) {
    createDashboard(device, config).then((dashboard) =>
      cy.visitApp(`device/${device.id}/dashboard/${dashboard.id}`, {
        language: 'en',
        // The widget's host is display: contents and has no box of its own.
        waitFor: `${WIDGET} .kpi-trend`,
      })
    );
  }

  before(() => {
    cy.getAuth().login();
    const now = Date.now();
    const time = (i: number) => new Date(now - (HISTORY.length - 1 - i) * 5 * 60_000).toISOString();
    cy.createDevice({
      name: `Generator ${now}`,
      // The widget reads the current value from here before the first realtime update.
      c8y_LatestMeasurements: {
        [FRAGMENT]: { [SERIES]: { value: CURRENT, unit: UNIT, time: time(HISTORY.length - 1) } },
      },
    }).then((d) => {
      device = d;
      HISTORY.forEach((value, i) =>
        cy.c8yclient((c) =>
          c.measurement.create({
            source: { id: d.id },
            type: FRAGMENT,
            time: time(i),
            [FRAGMENT]: { [SERIES]: { value, unit: UNIT } },
          })
        )
      );
    });
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('shows the value against its maximum in the radial layout', () => {
    visitWithConfig({ datapoints: [datapoint(device)], variant: 'radial' });

    cy.get(`${WIDGET} .kpi-trend--radial`).should('exist');
    cy.get(`${WIDGET} .kpi-trend__label`).should('contain.text', 'Generator temperature');
    cy.get(`${WIDGET} .kpi-trend__window-badge`).should('have.text', '(1h)');
    cy.get(`${WIDGET} ps-kpi-trend-gauge-arc`).should('exist').and('not.have.class', 'kt-gauge-arc--critical');
    cy.get(`${WIDGET} .kt-gauge-arc__value`).should('contain.text', String(CURRENT));
    cy.get(`${WIDGET} .kt-gauge-arc__sub`).should('contain.text', UNIT);
    // The history is rising, and a higher value is better by default.
    cy.get(`${WIDGET} .kpi-trend__spark-line`).invoke('attr', 'd').should('match', /^M /);
    cy.get(`${WIDGET} .kpi-trend__trend`)
      .should('have.class', 'kpi-trend__trend--good')
      .and('contain.text', '▲');
  });

  it('shows the value as a percentage ring in the compact layout', () => {
    visitWithConfig({ datapoints: [datapoint(device, { max: 200 })], variant: 'compact' });

    cy.get(`${WIDGET} .kpi-trend--compact`).should('exist');
    cy.get(`${WIDGET} .kpi-trend__compact-value`).should('have.text', String(CURRENT));
    cy.get(`${WIDGET} .kpi-trend__compact-unit`).should('have.text', UNIT);
    cy.get(`${WIDGET} .kpi-trend__ring-pct`).should('have.text', '36%');
  });

  it('colors the gauge when the value is in the red range', () => {
    visitWithConfig({
      datapoints: [datapoint(device, { redRangeMin: 70, redRangeMax: 100 })],
      variant: 'compact',
    });

    cy.get(`${WIDGET} .kpi-trend__compact-ring`).should('have.class', 'kpi-trend__compact-ring--critical');
  });

  it('shows the bare value without a maximum', () => {
    visitWithConfig({ datapoints: [datapoint(device, { max: null })], variant: 'radial' });

    cy.get(`${WIDGET} ps-kpi-trend-gauge-arc`).should('not.exist');
    cy.get(`${WIDGET} .kpi-trend__value-large`).should('have.text', String(CURRENT));
  });

  it('asks for a data point when none is configured', () => {
    visitWithConfig({ datapoints: [] });

    cy.get(`${WIDGET} c8y-ui-empty-state`).should('be.visible');
  });

  it('saves the layout chosen in the Appearance section', () => {
    visitWithConfig({ datapoints: [datapoint(device)], variant: 'radial' });
    cy.intercept('PUT', '**/inventory/managedObjects/*').as('saveDashboard');
    openWidgetForEditing();

    cy.contains('button', 'Appearance').click();
    cy.get('ps-kpi-trend-widget-config input[name="kpiVariant"][value="compact"]').check({ force: true });
    // Only the dialog's preview can be compact before the save: it follows the form.
    cy.get(`${WIDGET} .kpi-trend--compact`).should('exist');
    saveWidgetAndDashboard();

    cy.wait('@saveDashboard')
      .its('request.body.c8y_Dashboard.children')
      .then((children: Record<string, { config: Record<string, unknown> }>) => {
        expect(Object.values(children)[0].config).to.have.property('variant', 'compact');
      });
    cy.get(`${WIDGET} .kpi-trend--compact`).should('exist');
  });
});
