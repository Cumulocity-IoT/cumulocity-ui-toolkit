/// <reference types="cypress" />
import { IManagedObject } from '@c8y/client';
import { AddWidgetDialog, Dashboard, DashboardSelectors, WidgetConfigSelectors } from '@cumulocity-iot/ui-sdk/cypress';

const WIDGET_ID = 'events-graph.widget';
const WIDGET = 'c8y-events-graph';
const CONFIG = 'c8y-event-status';
const TYPE = 'e2e_MachineState';
const cy_ = (name: string) => `[data-cy="events-graph${name}"]`;

const BASE_CONFIG = {
  hours: 4,
  realtime: false,
  realtimeInterval: 30000,
  scale: 0.2,
  types: [
    {
      type: TYPE,
      values: [
        { name: 'RUNNING', label: 'Running', color: '#00aa00' },
        { name: 'STOPPED', label: 'Stopped', color: '#aa0000' },
      ],
    },
  ],
};

function createDashboard(
  device: IManagedObject,
  config: Record<string, unknown> | null
): Cypress.Chainable<IManagedObject> {
  const children: Record<string, unknown> = {};
  if (config) {
    children['egw1'] = {
      id: 'egw1',
      componentId: WIDGET_ID,
      name: WIDGET_ID,
      title: 'Machine states',
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
        name: 'Events Graph Dashboard',
        c8y_Dashboard: { name: 'Events Graph Dashboard', icon: 'th', priority: 10000, children },
        [`c8y_Dashboard!device!${device.id}`]: {},
      })
    )
    .then((res) => res.body as IManagedObject);
}

describe('Events Graph Widget', () => {
  let device: IManagedObject;

  function visitDashboard(dashboard: IManagedObject, selector: string) {
    cy.visitApp(`device/${device.id}/dashboard/${dashboard.id}`, { language: 'en', waitFor: selector });
  }

  function visitWithConfig(config: Record<string, unknown>, selector = WIDGET) {
    createDashboard(device, {
      ...BASE_CONFIG,
      device: { id: device.id, name: device.name },
      ...config,
    }).then((dashboard) => visitDashboard(dashboard, selector));
  }

  before(() => {
    cy.getAuth().login();
    cy.createDevice({ name: `Machine ${Date.now()}` }).then((d) => {
      device = d;
      // one state before the 4 h window (picked up as the initial state) and alternating
      // states every 30 minutes inside it
      const states = ['STOPPED', 'RUNNING', 'STOPPED', 'RUNNING', 'STOPPED', 'RUNNING', 'STOPPED'];
      states.forEach((text, i) => {
        const time = new Date(Date.now() - (5 - i * 0.5) * 3600 * 1000).toISOString();
        cy.c8yclient((c) => c.event.create({ source: { id: d.id }, type: TYPE, text, time }));
      });
    });
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('is offered in the add-widget dialog and saves the configured event types', () => {
    createDashboard(device, null).then((dashboard) => {
      cy.intercept('PUT', `**/inventory/managedObjects/${dashboard.id}`).as('saveDashboard');
      visitDashboard(dashboard, DashboardSelectors.WIDGET_EDIT_READY);
    });
    AddWidgetDialog.openAndSelect('Events Graph');

    cy.get(CONFIG).within(() => {
      cy.get(cy_('-config--type')).should('not.exist');
      cy.get(cy_('-config--refresh-interval')).should('have.value', '30').and('be.disabled');

      cy.get(cy_('-config--hours')).type('{selectall}6');
      cy.get(cy_('-config--realtime')).check({ force: true });
      cy.get(cy_('-config--refresh-interval')).should('be.enabled').type('{selectall}10');

      // first type with two values
      cy.get(cy_('-config--add-type')).click();
      cy.get(cy_('-config--type')).should('have.length', 1);
      cy.get(cy_('-config--remove-type')).should('not.exist');
      cy.get(cy_('-config--type-input')).type(TYPE);
      cy.get(cy_('-config--value-name')).type('RUNNING');
      cy.get(cy_('-config--value-label')).type('Running');
      cy.get(cy_('-config--value-color'))
        .invoke('val', '#00aa00')
        .trigger('input')
        .trigger('change');
      cy.get(cy_('-config--remove-value')).should('not.exist');
      cy.get(cy_('-config--add-value')).click();
      cy.get(cy_('-config--value-name')).should('have.length', 2).last().type('STOPPED');

      // a second type that is removed again, and a value that is removed again
      cy.get(cy_('-config--add-type')).click();
      cy.get(cy_('-config--type')).should('have.length', 2);
      cy.get(cy_('-config--remove-type')).last().click();
      cy.get(cy_('-config--type')).should('have.length', 1);
      cy.get(cy_('-config--add-value')).click();
      cy.get(cy_('-config--value-name')).should('have.length', 3);
      cy.get(cy_('-config--remove-value')).last().click();
      cy.get(cy_('-config--value-name')).should('have.length', 2);
    });
    cy.get(WidgetConfigSelectors.SAVE).should('be.enabled').click();
    Dashboard.saveIfVisible();

    cy.wait('@saveDashboard')
      .its('request.body.c8y_Dashboard.children')
      .then((children: Record<string, { config: Record<string, unknown> }>) => {
        const config = Object.values(children)[0].config;
        expect(config).to.deep.include({ hours: 6, realtime: true, realtimeInterval: 10000 });
        expect(config).to.have.nested.property('device.id', device.id);
        expect(config.types).to.deep.equal([
          {
            type: TYPE,
            values: [
              { name: 'RUNNING', label: 'Running', color: '#00aa00' },
              {
                name: 'STOPPED',
                label: '',
                color: (config.types as { values: { color: string }[] }[])[0].values[1].color,
              },
            ],
          },
        ]);
      });
    cy.get(`${WIDGET} ${cy_('--chart')} canvas`).should('be.visible');
  });

  it('queries the events of each configured type and renders the timeline', () => {
    cy.intercept('GET', '**/event/events?*').as('events');
    visitWithConfig({});

    cy.wait('@events').its('request.query').should('deep.include', {
      source: device.id,
      type: TYPE,
      pageSize: '2000',
      revert: 'true',
    });
    // the state active at the window start is looked up separately
    cy.wait('@events').its('request.query').should('deep.include', {
      source: device.id,
      type: TYPE,
      pageSize: '1',
    });
    cy.get(`${WIDGET} ${cy_('--chart')} canvas`).should('be.visible');
    cy.get(`${WIDGET} ${cy_('--reload-button')}`).should('not.exist');
  });

  it('queries one request pair per event type', () => {
    cy.intercept('GET', '**/event/events?*').as('events');
    visitWithConfig({
      types: [
        ...BASE_CONFIG.types,
        { type: 'e2e_Other', values: [{ name: 'X', label: '', color: '#000000' }] },
      ],
    });

    cy.get(`${WIDGET} ${cy_('--chart')} canvas`).should('be.visible');
    // the other type has no events → no lookup of the previous state
    cy.get('@events.all').should('have.length', 3);
    cy.get('@events.all').then((calls) => {
      const types = (calls as unknown as { request: { query: { type: string } } }[]).map(
        (c) => c.request.query.type
      );
      expect(types).to.include('e2e_Other');
    });
  });

  it('reloads the events with the auto refresh reload button', () => {
    cy.intercept('GET', '**/event/events?*').as('events');
    visitWithConfig({ realtime: true, realtimeInterval: 600000 });

    cy.get(`${WIDGET} ${cy_('--chart')} canvas`).should('be.visible');
    cy.get('@events.all').should('have.length', 2);
    cy.get(`${WIDGET} c8y-countdown-interval`).should('exist');
    cy.get(`${WIDGET} ${cy_('--reload-button')}`).click();
    cy.get('@events.all').should('have.length', 4);
  });

  it('shows an empty state when no event type is configured', () => {
    cy.intercept('GET', '**/event/events?*').as('events');
    visitWithConfig({ types: [] });

    cy.get(`${WIDGET} ${cy_('--no-types')}`).should('contain.text', 'No event types configured');
    cy.get(`${WIDGET} ${cy_('--chart')}`).should('not.exist');
    cy.get('@events.all').should('have.length', 0);
  });

  it('shows an empty state when no device is selected', () => {
    createDashboard(device, BASE_CONFIG).then((dashboard) => visitDashboard(dashboard, WIDGET));

    cy.get(`${WIDGET} ${cy_('--no-device')}`).should('contain.text', 'No device selected');
  });

  it('shows an error state when the events cannot be loaded', () => {
    cy.intercept('GET', '**/event/events?*', { statusCode: 500, body: {} }).as('eventsFail');
    visitWithConfig({});

    cy.wait('@eventsFail');
    cy.get(`${WIDGET} ${cy_('--error')}`).should('contain.text', 'Could not load events');
    cy.get(`${WIDGET} ${cy_('--chart')}`).should('not.exist');
  });
});
