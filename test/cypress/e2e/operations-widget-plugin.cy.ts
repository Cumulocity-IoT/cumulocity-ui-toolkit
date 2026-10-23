/// <reference types="cypress" />
import { IManagedObject } from '@c8y/client';
import { registerTestId } from '../support/utils';
import { C8yAddWidgetDialog } from '../support/page-objects';
import { openWidgetForEditing } from '../support/intercepts';
import { DashboardSelectors, WidgetConfigSelectors } from '../support/selectors';

const CYPRESS_TEST_ID = 'operations-widget-tests';
registerTestId(CYPRESS_TEST_ID);

const WIDGET_ID = 'c8y.operations-widget.plugin';
const WIDGET_SELECTOR = 'c8y-operations-widget';

interface ButtonConfig {
  label: string;
  description: string;
  operationFragment: string;
  operationValue: string;
  showModal: boolean;
  modalText?: string;
  buttonClasses?: string;
  icon?: string;
  fields?: unknown[];
}

/** Creates a device with supported operations in the (mock) inventory. */
function createTestDevice(): Cypress.Chainable<IManagedObject> {
  return cy.createDevice({
    name: `Ops Device ${Date.now()}`,
    cy_testId: CYPRESS_TEST_ID,
    c8y_SupportedOperations: ['c8y_Restart', 'c8y_Command'],
    // the mock only accepts operations for agents
    com_cumulocity_model_Agent: {},
  });
}

/** Creates a device dashboard holding one operations widget with the given config. */
function createDashboard(
  device: IManagedObject,
  config: Record<string, unknown>
): Cypress.Chainable<IManagedObject> {
  const children: Record<string, unknown> = {};
  const widgetKey = `${Date.now()}`;
  children[widgetKey] = {
    id: widgetKey,
    componentId: WIDGET_ID,
    name: WIDGET_ID,
    title: 'Operations',
    config,
    _x: 0,
    _y: 0,
    _width: 12,
    _height: 6,
  };
  return cy
    .c8yclient((c) =>
      c.inventory.create({
        name: 'Ops Dashboard',
        cy_testId: CYPRESS_TEST_ID,
        c8y_Dashboard: { name: 'Ops Dashboard', icon: 'th', priority: 10000, children },
        [`c8y_Dashboard!device!${device.id}`]: {},
      })
    )
    .then((res) => res.body as IManagedObject);
}

function deviceRef(device: IManagedObject) {
  return {
    id: device.id,
    name: device.name,
    c8y_SupportedOperations: device['c8y_SupportedOperations'],
  };
}

function restartButton(device: IManagedObject, overrides: Partial<ButtonConfig> = {}): ButtonConfig {
  return {
    label: 'Restart',
    description: 'Restart the device',
    operationFragment: 'c8y_Restart',
    operationValue: JSON.stringify({ deviceId: device.id, c8y_Restart: {} }),
    showModal: false,
    buttonClasses: 'btn-primary',
    icon: 'refresh',
    fields: [],
    ...overrides,
  };
}

function visitDevice(device: IManagedObject, selector = WIDGET_SELECTOR) {
  cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', selector);
  // the shell redirects to the dashboard route and re-renders the widget; wait for that
  cy.location('hash').should('include', '/dashboard/');
  cy.get(selector).should('be.visible');
}

describe('Operations Widget', () => {
  let device: IManagedObject;

  before(() => {
    cy.getAuth().login();
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
    createTestDevice().then((d) => (device = d));
  });

  it('is listed in the add-widget dialog and opens its config form', () => {
    createDashboard(device, {}).then(() => {
      cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', DashboardSelectors.WIDGET_EDIT_READY);
    });
    C8yAddWidgetDialog.openAndSelect('Operations');
    cy.get('app-operations-widget-config').should('exist');
  });

  it('renders configured buttons with label, color, icon and description', () => {
    createDashboard(device, {
      device: deviceRef(device),
      buttons: [
        restartButton(device),
        restartButton(device, {
          label: 'Second',
          description: 'Second button',
          buttonClasses: 'btn-danger',
          icon: undefined,
        }),
      ],
    });
    visitDevice(device);

    cy.get(`${WIDGET_SELECTOR} button-instance`).should('have.length', 2);
    cy.get(`${WIDGET_SELECTOR} button-instance button`)
      .first()
      .should('contain.text', 'Restart')
      .and('have.class', 'btn-primary')
      .and('have.attr', 'title', 'Restart the device')
      .find('i')
      .should('exist');
    cy.get(`${WIDGET_SELECTOR} button-instance button`)
      .eq(1)
      .should('contain.text', 'Second')
      .and('have.class', 'btn-danger')
      .find('i')
      .should('not.exist');
  });

  it('creates the operation directly when no confirmation is required', () => {
    createDashboard(device, { device: deviceRef(device), buttons: [restartButton(device)] });
    cy.intercept('POST', '**/devicecontrol/operations').as('createOperation');
    visitDevice(device);

    cy.contains(`${WIDGET_SELECTOR} button-instance button`, 'Restart').click();

    cy.wait('@createOperation').then(({ request, response }) => {
      expect(request.body).to.deep.include({
        deviceId: device.id,
        c8y_Restart: {},
        description: 'Restart the device',
      });
      expect(response?.statusCode).to.be.lessThan(300);
    });
    cy.get('c8y-alert-outlet .alert-success').should('contain.text', "Operation 'Restart' successfully created.");
  });

  it('shows an error alert when creating the operation fails', () => {
    createDashboard(device, { device: deviceRef(device), buttons: [restartButton(device)] });
    cy.intercept('POST', '**/devicecontrol/operations', { statusCode: 500, body: {} }).as(
      'createOperationFail'
    );
    visitDevice(device);

    cy.contains(`${WIDGET_SELECTOR} button-instance button`, 'Restart').click();

    cy.wait('@createOperationFail');
    cy.get('c8y-alert-outlet .alert-danger').should('contain.text', "Failed to create 'Restart' operation.");
  });

  it('asks for confirmation and only sends the operation after confirming', () => {
    createDashboard(device, {
      device: deviceRef(device),
      buttons: [restartButton(device, { showModal: true, modalText: 'Really restart?' })],
    });
    cy.intercept('POST', '**/devicecontrol/operations').as('createOperation');
    visitDevice(device);

    // cancel: no request
    cy.contains(`${WIDGET_SELECTOR} button-instance button`, 'Restart').click();
    cy.get('.modal-content').should('contain.text', 'Really restart?');
    cy.get('.modal-content button[title="Cancel"]').click();
    cy.get('.modal-content').should('not.exist');

    // confirm: request sent
    cy.contains(`${WIDGET_SELECTOR} button-instance button`, 'Restart').click();
    cy.get('.modal-content button[title="Confirm"]').click();
    cy.wait('@createOperation').its('request.body.c8y_Restart').should('deep.equal', {});
    cy.get('c8y-alert-outlet .alert-success').should('be.visible');
  });

  it('collects placeholder values in a form, previews the payload and sends it', () => {
    createDashboard(device, {
      device: deviceRef(device),
      buttons: [
        restartButton(device, {
          label: 'Command',
          description: 'Send shell command',
          operationFragment: 'c8y_Command',
          operationValue: JSON.stringify({
            deviceId: device.id,
            c8y_Command: { text: '{{text}}', mode: '{{mode}}' },
          }),
          fields: [
            { key: 'text', path: 'c8y_Command.text', label: 'Command text', type: 'input', options: [] },
            {
              key: 'mode',
              path: 'c8y_Command.mode',
              label: 'Mode',
              type: 'select',
              options: [
                { label: 'Fast', value: 'fast' },
                { label: 'Slow', value: 'slow' },
              ],
            },
          ],
        }),
      ],
    });
    cy.intercept('POST', '**/devicecontrol/operations').as('createOperation');
    visitDevice(device);

    cy.contains(`${WIDGET_SELECTOR} button-instance button`, 'Command').click();
    cy.get('.modal-content').should('contain.text', 'Configure Operation');
    cy.get('.modal-content formly-form input').should('have.length.at.least', 1);
    cy.get('.modal-content button.btn-primary').contains('Send').should('be.disabled');

    cy.get('.modal-content formly-form input[type="text"]').first().type('reboot now');
    cy.get('.modal-content formly-form select').select('Slow');
    cy.get('.modal-content pre code').should('contain.text', 'reboot now').and('contain.text', 'slow');

    cy.get('.modal-content button.btn-primary').contains('Send').should('be.enabled').click();
    cy.wait('@createOperation')
      .its('request.body')
      .should('deep.include', {
        deviceId: device.id,
        description: 'Send shell command',
      })
      .its('c8y_Command')
      .should('deep.equal', { text: 'reboot now', mode: 'slow' });
  });

  it('shows an error when no target device is configured', () => {
    createDashboard(device, { buttons: [restartButton(device)] });
    cy.intercept('POST', '**/devicecontrol/operations').as('createOperation');
    visitDevice(device);

    cy.contains(`${WIDGET_SELECTOR} button-instance button`, 'Restart').click();
    cy.get('c8y-alert-outlet .alert-danger').should('contain.text', 'No target device configured');
  });

  it('configures a new button in the config form and saves it to the dashboard', () => {
    createDashboard(device, { device: deviceRef(device), buttons: [] }).then((dashboard) => {
      cy.intercept('PUT', `**/inventory/managedObjects/${dashboard.id}`).as('saveDashboard');
    });
    cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', DashboardSelectors.EDIT_WIDGETS);
    openWidgetForEditing();

    cy.get('app-operations-widget-config').within(() => {
      cy.contains('button', 'Add First Button').click();
      // supported operations come from the device and are offered in a select
      cy.get('select#operation_0').should('have.value', 'c8y_Command');
      cy.get('select#operation_0').select('c8y_Restart');
      cy.get('input#label_0').clear().type('Reboot');
      cy.get('input#description_0').type('Reboot it');
      cy.get('button[title="Color of the button"]').click();
      cy.contains('.dropdown-menu button', 'btn-success').click();
      cy.get('button[title="Color of the button"]').should('contain.text', 'btn-success');
      // the operation body editor seeds an `{{test}}` placeholder, which becomes a form field
      cy.get('operations-editor').should('exist');
      cy.get('input[placeholder="Key"]').should('have.value', 'test');
      cy.get('input[placeholder="Label"]').first().clear().type('Test value');
      // confirmation is only offered for buttons without placeholders
      cy.contains('label', 'Requires confirmation').should('not.exist');
      cy.contains('button', 'Add Button').click();
      cy.get('.button-config').should('have.length', 2);
      cy.contains('.button-config', '2. Button').contains('button', 'Delete Button').click();
      cy.get('.button-config').should('have.length', 1);
    });

    cy.get(WidgetConfigSelectors.SAVE).click();
    cy.get(DashboardSelectors.SAVE).click({ force: true });

    cy.wait('@saveDashboard')
      .its('request.body.c8y_Dashboard.children')
      .then((children: Record<string, { config: { buttons: ButtonConfig[] } }>) => {
        const config = Object.values(children)[0].config;
        expect(config.buttons).to.have.length(1);
        expect(config.buttons[0]).to.deep.include({
          label: 'Reboot',
          description: 'Reboot it',
          operationFragment: 'c8y_Restart',
          buttonClasses: 'btn-success',
          showModal: false,
        });
        expect(config.buttons[0].fields).to.deep.equal([
          { key: 'test', path: 'c8y_Restart.example', label: 'Test value', type: 'input', options: [] },
        ]);
        expect(JSON.parse(config.buttons[0].operationValue)).to.have.property('deviceId', device.id);
      });
    cy.get(`${WIDGET_SELECTOR} button-instance button`).should('contain.text', 'Reboot');
  });
});
