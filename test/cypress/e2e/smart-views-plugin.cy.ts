/// <reference types="cypress" />

import { IManagedObject } from '@c8y/client';

/**
 * Smart Views — runs against the tenant mock (windy-dev world: 15 `wind_turbine` assets).
 *
 * Covered:
 *  - configuration page (Settings → Smart views): list, empty state, error state, navigator entry
 *  - "Add configuration" modal: asset definitions, DTM-derived columns (and the fallback to the
 *    default columns when DTM is unavailable), add/remove columns, validation, create → POST body,
 *    save failure
 *  - a created view appears in the navigator without a reload and opens its page
 *  - edit (pre-filled modal → PUT) and delete (confirm → DELETE; cancel keeps it)
 *  - smart view page: grid lists the assets matching the stored query, search narrows it while
 *    keeping the base query, the ID cell links to the asset, error states
 *  - "Export CSV": item count, export with the configured columns as CSV, done state
 *
 * The DTM microservice is not emulated by the mock, so `service/dtm/**` is stubbed.
 */


const CONFIG_TYPE = 'c8y_SmartViewConfiguration';
const ASSET_TYPE = 'wind_turbine';
const TURBINE_COUNT = 15;

const CONFIG_GRID = '[data-cy="smart-views--configuration-grid"]';
const ROW = '[data-cy="c8y-data-grid--row-in-data-grid"]';
const ADD_BUTTON = '[data-cy="smart-views--add-configuration"]';
const NAME_INPUT = '[data-cy="smart-views--config-name"]';
const DEFINITION_SELECT = '[data-cy="smart-views--config-asset-definition"]';
const PRIORITY_INPUT = '[data-cy="smart-views--config-priority"]';
const COLUMN = '[data-cy="smart-views--config-column"]';
const ADD_COLUMN = '[data-cy="smart-views--config-add-column"]';
const REMOVE_COLUMN = '[data-cy="smart-views--config-remove-column"]';
const FROM_DEFINITION = '[data-cy="smart-views--config-columns-from-definition"]';
const SAVE = '[data-cy="smart-views--config-save"]';
const CANCEL = '[data-cy="smart-views--config-cancel"]';
const VIEW_GRID = '[data-cy="smart-views--view-grid"]';
const VIEW_ERROR = '[data-cy="smart-views--view-error"]';
const EXPORT_BUTTON = '[data-cy="smart-views--export"]';
const EXPORT_COUNT = '[data-cy="smart-views--export-count"]';
const EXPORT_CONFIRM = '[data-cy="smart-views--export-confirm"]';
const EXPORT_DONE = '[data-cy="smart-views--export-done"]';

const DEFAULT_COLUMNS = [
  { name: 'id', path: 'id', header: 'ID' },
  { name: 'name', path: 'name', header: 'Name' },
  { name: 'description', path: 'description', header: 'Description' },
];

function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}`;
}

function createAssetDefinition(name = ASSET_TYPE): Cypress.Chainable<IManagedObject> {
  return cy
    .c8yclient((c) =>
      c.inventory.create({
        type: 'c8y_AssetDefinition',
        name,
        icon: { name: 'wind-turbine' },
      })
    )
    .then((res) => res.body as IManagedObject);
}

function createConfiguration(
  name: string,
  overrides: Record<string, unknown> = {}
): Cypress.Chainable<IManagedObject> {
  return cy
    .c8yclient((c) =>
      c.inventory.create({
        type: CONFIG_TYPE,
        name,
        c8y_SmartViewConfiguration: {
          icon: 'wind-turbine',
          query: `(type eq '${ASSET_TYPE}') and has(c8y_IsAsset)`,
          columns: [
            ...DEFAULT_COLUMNS,
            { name: 'serial', path: 'c8y_Hardware.serialNumber', header: 'Serial' },
          ],
          priority: 500,
          ...overrides,
        },
      })
    )
    .then((res) => res.body as IManagedObject);
}

/** Deletes every configuration left over from earlier tests (the mock keeps writes per run). */
function deleteAllConfigurations(): void {
  cy.c8yclient((c) => c.inventory.list({ type: CONFIG_TYPE, pageSize: 2000 })).then((res) => {
    const body = res.body as { managedObjects?: IManagedObject[] } | IManagedObject[];
    const items = Array.isArray(body) ? body : (body.managedObjects ?? []);

    items.forEach((mo) => cy.c8yclient((c) => c.inventory.delete(mo.id)));
  });
}

function stubDtm(available = true): void {
  if (!available) {
    cy.intercept('GET', '**/service/dtm/**', { statusCode: 503, body: {} }).as('dtm');

    return;
  }
  cy.intercept('GET', `**/service/dtm/definitions/assets/${ASSET_TYPE}`, {
    identifier: ASSET_TYPE,
    composition: {
      allowedProperties: [{ identifier: 'name' }, { identifier: 'c8y_Hardware' }],
    },
  }).as('dtmAssetDefinition');
  cy.intercept('GET', '**/service/dtm/definitions/properties*', {
    definitions: [
      { identifier: 'name', jsonSchema: { title: 'Turbine name' } },
      { identifier: 'c8y_Hardware', jsonSchema: { title: 'Hardware' } },
    ],
  }).as('dtmProperties');
}

function selectAssetDefinition(): void {
  cy.get(DEFINITION_SELECT)
    .find('option')
    .contains(ASSET_TYPE)
    .then(($opt) => {
      cy.get(DEFINITION_SELECT).select($opt.val() as string);
    });
}

function visitConfigurationPage(): void {
  cy.intercept('GET', `**/inventory/managedObjects?*type=${CONFIG_TYPE}*`).as('listConfigurations');
  cy.visitApp('smart-views-configuration', { language: 'en', waitFor: ADD_BUTTON });
  cy.wait('@listConfigurations');
}

function visitSmartView(id: string): void {
  cy.visitApp(`smart-views/${id}`, { language: 'en', waitFor: '#navigator' });
}

function gridRow(text: string) {
  return cy.get(CONFIG_GRID).contains(ROW, text);
}

describe('Smart Views', () => {
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
    deleteAllConfigurations();
  });

  describe('configuration page', () => {
    it('shows the empty state and a Settings → Smart views navigator entry', () => {
      visitConfigurationPage();

      cy.get('c8y-header-bar').should('contain.text', 'Smart views configuration');
      cy.get(CONFIG_GRID).should('contain.text', 'No smart view configurations found.');
      cy.get('c8y-navigator-outlet').contains('Smart views').should('exist');
    });

    it('lists existing configurations with their query', () => {
      const name = uniqueName('Turbines');

      createConfiguration(name);
      visitConfigurationPage();

      gridRow(name).should('contain.text', `type eq '${ASSET_TYPE}'`);
    });

    it('shows an error when the configurations cannot be loaded', () => {
      cy.intercept('GET', `**/inventory/managedObjects?*type=${CONFIG_TYPE}*`, {
        statusCode: 500,
        body: {},
      });
      cy.visitApp('smart-views-configuration', { language: 'en', waitFor: ADD_BUTTON });

      cy.get('[data-cy="smart-views--configuration-error"]').should(
        'contain.text',
        'Could not load smart view configurations.'
      );
    });
  });

  describe('create', () => {
    beforeEach(() => {
      createAssetDefinition();
    });

    it('creates a configuration with DTM-derived columns and adds it to the navigator', () => {
      const name = uniqueName('Wind fleet');

      stubDtm();
      cy.intercept('POST', '**/inventory/managedObjects').as('create');
      visitConfigurationPage();

      cy.get(ADD_BUTTON).click();
      cy.get(SAVE).should('be.disabled');
      cy.get(COLUMN).should('have.length', DEFAULT_COLUMNS.length);

      cy.get(NAME_INPUT).type(name);
      selectAssetDefinition();
      cy.wait('@dtmAssetDefinition');
      cy.wait('@dtmProperties');

      cy.get(FROM_DEFINITION).should('be.visible');
      // id + description defaults stay, `name` is replaced by the DTM column, plus c8y_Hardware.
      cy.get(COLUMN).should('have.length', 4);
      cy.get(COLUMN).eq(3).find('input').eq(2).should('have.value', 'Hardware');

      cy.get(PRIORITY_INPUT).clear().type('900');
      cy.get(SAVE).should('not.be.disabled').click();

      cy.wait('@create').then(({ request }) => {
        expect(request.body.type).to.eq(CONFIG_TYPE);
        expect(request.body.name).to.eq(name);
        expect(request.body.c8y_SmartViewConfiguration).to.deep.include({
          query: `(type eq '${ASSET_TYPE}') and has(c8y_IsAsset)`,
          icon: 'wind-turbine',
          priority: 900,
          assetDefinitionName: ASSET_TYPE,
        });
        expect(request.body.c8y_SmartViewConfiguration.columns).to.deep.include({
          name: 'name',
          path: 'name',
          header: 'Turbine name',
        });
      });

      cy.get('c8y-alert-outlet').should('contain.text', 'Smart view configuration created.');
      gridRow(name).should('exist');

      // The navigator factory refreshes on change: the new view is reachable without a reload.
      cy.get('c8y-navigator-outlet').contains(name).click({ force: true });
      cy.location('hash').should('match', /#\/smart-views\/\d+/);
      cy.get(VIEW_GRID).find(ROW).should('have.length', TURBINE_COUNT);
    });

    it('keeps the default columns when DTM is unavailable and supports adding/removing columns', () => {
      stubDtm(false);
      visitConfigurationPage();

      cy.get(ADD_BUTTON).click();
      selectAssetDefinition();
      cy.wait('@dtm');

      cy.get(FROM_DEFINITION).should('not.exist');
      cy.get(COLUMN).should('have.length', DEFAULT_COLUMNS.length);

      cy.get(ADD_COLUMN).click();
      cy.get(COLUMN).should('have.length', DEFAULT_COLUMNS.length + 1);
      cy.get(COLUMN).last().find(REMOVE_COLUMN).click();
      cy.get(COLUMN).should('have.length', DEFAULT_COLUMNS.length);

      // No name yet → not savable; cancel closes without a request.
      cy.get(SAVE).should('be.disabled');
      cy.get(CANCEL).click();
      cy.get(NAME_INPUT).should('not.exist');
    });

    it('shows an error alert when saving fails', () => {
      stubDtm(false);
      cy.intercept('POST', '**/inventory/managedObjects', { statusCode: 500, body: {} }).as(
        'createFail'
      );
      visitConfigurationPage();

      cy.get(ADD_BUTTON).click();
      cy.get(NAME_INPUT).type('Failing view');
      selectAssetDefinition();
      cy.get(SAVE).click();
      cy.wait('@createFail');

      cy.get('c8y-alert-outlet').should('contain.text', 'Could not save smart view configuration.');
      cy.get(NAME_INPUT).should('be.visible');
    });
  });

  describe('edit and delete', () => {
    it('edits a configuration in the pre-filled modal', () => {
      const name = uniqueName('Editable');

      createAssetDefinition()
        .then((definition) =>
          createConfiguration(name, {
            assetDefinitionId: definition.id,
            assetDefinitionName: ASSET_TYPE,
          })
        )
        .then((config) => {
          cy.intercept('PUT', `**/inventory/managedObjects/${config.id}`).as('update');
        });
      visitConfigurationPage();

      gridRow(name)
        .find('[data-cy="c8y-data-grid--edit-button-in-row"]')
        .first()
        .click({ force: true });
      cy.get(NAME_INPUT).should('have.value', name);
      cy.get(COLUMN).should('have.length', 4);
      cy.get(NAME_INPUT).clear().type(`${name} v2`);
      cy.get(SAVE).should('contain.text', 'Save').click();

      cy.wait('@update').its('request.body.name').should('eq', `${name} v2`);
      cy.get('c8y-alert-outlet').should('contain.text', 'Smart view configuration updated.');
      gridRow(`${name} v2`).should('exist');
    });

    it('deletes a configuration after confirmation', () => {
      const name = uniqueName('Deletable');

      createConfiguration(name).then((config) => {
        cy.intercept('DELETE', `**/inventory/managedObjects/${config.id}`).as('delete');
      });
      visitConfigurationPage();

      gridRow(name)
        .find('[data-cy="c8y-data-grid--remove-button-in-row"]')
        .first()
        .click({ force: true });
      cy.get('c8y-confirm-modal').should(
        'contain.text',
        `Are you sure you want to delete "${name}"?`
      );
      cy.get('c8y-confirm-modal').contains('button', 'Cancel').click();
      gridRow(name).should('exist');

      gridRow(name)
        .find('[data-cy="c8y-data-grid--remove-button-in-row"]')
        .first()
        .click({ force: true });
      cy.get('c8y-confirm-modal').contains('button', 'Delete').click();
      cy.wait('@delete');
      cy.get(CONFIG_GRID).should('not.contain.text', name);
    });
  });

  describe('smart view page', () => {
    let config: IManagedObject;

    beforeEach(() => {
      createConfiguration(uniqueName('Turbine view')).then((c) => (config = c));
    });

    it('lists the assets matching the stored query with the configured columns', () => {
      cy.then(() => visitSmartView(config.id));

      cy.get(VIEW_GRID).find(ROW).should('have.length', TURBINE_COUNT);
      cy.get(VIEW_GRID).find('thead').should('contain.text', 'Serial');
      cy.get(VIEW_GRID).find(ROW).first().find('a[href*="/group/"]').should('exist');
    });

    it('narrows the list with search while keeping the base query', () => {
      cy.then(() => visitSmartView(config.id));
      cy.get(VIEW_GRID).find(ROW).should('have.length', TURBINE_COUNT);

      cy.intercept('GET', '**/inventory/managedObjects?*CUWTG05*').as('search');
      cy.get(VIEW_GRID).find('input[type="search"]').first().type('CUWTG05');
      cy.wait('@search')
        .its('request.url')
        .should((url: string) => {
          const decoded = decodeURIComponent(url).replace(/\+/g, ' ');
          expect(decoded).to.contain(`type eq '${ASSET_TYPE}'`);
          expect(decoded).to.contain('*CUWTG05*');
        });
      cy.get(VIEW_GRID).find(ROW).should('have.length', 1).and('contain.text', 'CUWTG05');
    });

    it('opens the asset from the ID cell', () => {
      cy.then(() => visitSmartView(config.id));

      cy.get(VIEW_GRID).find(ROW).first().find('a[href*="/group/"]').click();
      cy.location('hash').should('match', /#\/group\/\d+/);
    });

    it('shows an error for a missing managed object and for one without configuration', () => {
      visitSmartView('999999999');
      cy.get(VIEW_ERROR).should('contain.text', 'Could not load smart view with ID "999999999".');

      cy.c8yclient((c) =>
        c.inventory.create({ name: 'Plain MO' })
      ).then((res) => visitSmartView((res.body as IManagedObject).id));
      cy.get(VIEW_ERROR).should(
        'contain.text',
        'This managed object has no smart-view configuration.'
      );
    });
  });

  describe('CSV export', () => {
    it('exports all matching assets with the configured columns', () => {
      const name = uniqueName('Export view');

      createConfiguration(name).then((c) => visitSmartView(c.id));
      cy.get(VIEW_GRID).find(ROW).should('have.length', TURBINE_COUNT);

      cy.get(EXPORT_BUTTON).click();
      cy.get(EXPORT_COUNT).should('have.text', String(TURBINE_COUNT));
      cy.get(EXPORT_CONFIRM).should('not.be.disabled').click();
      cy.get(EXPORT_DONE).should('contain.text', 'Your download has started.');

      cy.readFile(`${Cypress.config('downloadsFolder')}/${name}.csv`).should((csv: string) => {
        const lines = csv.trim().split(/\r?\n/);

        expect(lines[0]).to.contain('ID').and.contain('Name').and.contain('Serial');
        expect(lines).to.have.length(TURBINE_COUNT + 1);
        expect(csv).to.contain('CUWTG05');
      });
    });

    it('is only offered on the smart view page', () => {
      visitConfigurationPage();
      cy.get(EXPORT_BUTTON).should('not.exist');
    });
  });
});
