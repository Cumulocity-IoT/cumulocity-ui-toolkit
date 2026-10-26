/// <reference types="cypress" />

/**
 * Tenant Option Management e2e — runs against the tenant mock (windy-dev world)
 * inside the cockpit shell (the plugin's hooks are shell-agnostic: a navigator node
 * under "Settings" and the route `tenant-option-management`).
 *
 * Features:
 *  - navigator node Settings → Options and the route
 *  - plugin configuration MO (`tenant_option_plugin_config`), lazily created
 *  - grid of managed tenant options, empty state
 *  - create (text / JSON value), duplicate validation, API errors
 *  - edit, delete (confirm / cancel / error)
 *  - "Add existing" (allow-list an existing tenant option, or all options of a category)
 *  - export of selected options to a JSON file
 *  - import from a JSON file (new + conflicting entries, invalid files)
 */

const ROUTE = 'tenant-option-management';
const GRID = 'c8y-data-grid[data-cy="tenant-option-management--grid"]';
const ROW = '[data-cy="c8y-data-grid--row-in-data-grid"]';
const KEY_CELL = 'td[data-cy="data-grid--Key"]';
const CONTENT_CELL = 'td[data-cy="data-grid--Content"]';
const MODAL = '.modal-content';
const ALERT_DANGER = 'c8y-alert-outlet .alert-danger';
const ALERT_SUCCESS = 'c8y-alert-outlet .alert-success';
const CONFIRM_OK = '[data-cy="c8y-confirm-modal--ok"]';
const CONFIRM_CANCEL = '[data-cy="c8y-confirm-modal--cancel"]';
const CHECKBOX = '[data-cy="c8y-data-grid--checkbox"]';

let seq = 0;
/** Unique per test so writes to the shared in-memory mock never collide. */
function uniqueKey(prefix = 'key'): string {
  seq += 1;
  return `${prefix}${Date.now()}${seq}`;
}

const CATEGORY = 'cypresstom';

function createTenantOption(category: string, key: string, value: string) {
  return cy.c8yclient((c) => c.options.tenant.create({ category, key, value }));
}

function rowByKey(key: string) {
  return cy.contains(`${GRID} ${KEY_CELL}`, key).parents(ROW);
}

function visitPlugin() {
  cy.intercept('GET', '**/inventory/managedObjects?*type=tenant_option_plugin_config*').as(
    'getConfig'
  );
  cy.intercept('GET', '**/tenant/options?*').as('listOptions');
  cy.visitApp(ROUTE, { language: 'en', waitFor: '[data-cy="tenant-option-management--create"]' });
  cy.wait('@getConfig');
  // The grid is filled only once the option values are loaded too; acting before that races
  // the initial load, which replaces the rows when it completes.
  cy.wait('@listOptions');
}

/** Aliases only PUTs to the plugin configuration MO (the shell writes other MOs too). */
function interceptConfigUpdate() {
  cy.intercept('PUT', '**/inventory/managedObjects/*', (req) => {
    if (Array.isArray(req.body?.options)) req.alias = 'updateConfig';
  });
}

function createViaModal(category: string, key: string, value: string) {
  cy.get('[data-cy="tenant-option-management--create"]').click();
  cy.get(MODAL).should('be.visible');
  cy.get('[data-cy="add-option--category"]').type(category);
  cy.get('[data-cy="add-option--key"]').type(key);
  cy.get('[data-cy="add-option--value"]').type(value);
  cy.get('[data-cy="add-option--save"]').click();
}

describe('Tenant Option Management', () => {
  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
  });

  it('opens the page via Settings → Options and lazily creates the plugin configuration', () => {
    cy.intercept('GET', '**/inventory/managedObjects?*type=tenant_option_plugin_config*', (req) => {
      // pretend no configuration exists yet so the plugin creates it
      req.reply({ managedObjects: [], statistics: { currentPage: 1, pageSize: 1 } });
    }).as('getConfigEmpty');
    cy.intercept('POST', '**/inventory/managedObjects', (req) => {
      if (req.body?.type === 'tenant_option_plugin_config') req.alias = 'createConfig';
    });

    cy.visitApp('', { language: 'en', waitFor: '#navigator' });
    cy.get('c8y-navigator-node button[data-cy="Settings"]').click();
    cy.get('c8y-navigator-node button[data-cy="Options"]').should('be.visible').click();

    cy.location('hash').should('contain', ROUTE);
    cy.wait('@getConfigEmpty');
    cy.wait('@createConfig')
      .its('request.body')
      .should('deep.equal', { type: 'tenant_option_plugin_config', options: [] });
    cy.get('[data-cy="tenant-option-management--empty-state"]')
      .should('be.visible')
      .and('contain', 'No Tenant Option created or imported yet.');
    // export is disabled without rows
    cy.get('[data-cy="tenant-option-management--export"]').should('be.disabled');
  });

  it('creates a new text tenant option', () => {
    const key = uniqueKey();
    cy.intercept('POST', '**/tenant/options').as('createOption');
    interceptConfigUpdate();
    visitPlugin();

    createViaModal(CATEGORY, key, 'hello world');

    cy.wait('@createOption')
      .its('request.body')
      .should('deep.include', { category: CATEGORY, key, value: 'hello world' });
    cy.wait('@updateConfig').then(({ request }) => {
      const options = request.body.options as { category: string; key: string; user: string }[];
      const item = options.find((o) => o.key === key);
      expect(item).to.include({ category: CATEGORY });
      expect(item?.user).to.be.a('string').and.not.be.empty;
    });

    cy.get(MODAL).should('not.exist');
    rowByKey(key).find(CONTENT_CELL).should('contain', 'hello world');
    cy.get('[data-cy="tenant-option-management--export"]').should('not.be.disabled');
  });

  it('opens JSON values in the JSON editor tab when editing', () => {
    const key = uniqueKey('json');
    createTenantOption(CATEGORY, key, '{"a":1}');
    cy.intercept('PUT', `**/tenant/options/${CATEGORY}/${key}`).as('updateOption');
    visitPlugin();

    // register the existing option, then edit it
    cy.get('[data-cy="tenant-option-management--add-existing"]').click();
    cy.get('[data-cy="import-option--category"]').type(CATEGORY);
    cy.get('[data-cy="import-option--key"]').type(key);
    cy.get('[data-cy="import-option--import"]').click();
    cy.get(MODAL).should('not.exist');

    rowByKey(key).find('[data-cy="c8y-data-grid--edit-button-in-row"]').first().click({ force: true });
    cy.get('[data-cy="add-option--tab-json"]').parent('li').should('have.class', 'active');
    cy.get(`${MODAL} mapping-json-editor`).should('be.visible');
    cy.get('[data-cy="add-option--value"]').should('not.exist');
    // switching tabs resets the value, so Save gets disabled until a value is entered
    cy.get('[data-cy="add-option--tab-text"]').click();
    cy.get('[data-cy="add-option--save"]').should('be.disabled');
    cy.get('[data-cy="add-option--value"]').type('plain');
    cy.get('[data-cy="add-option--save"]').click();
    cy.wait('@updateOption').its('request.body').should('deep.include', { value: 'plain' });
    rowByKey(key).find(CONTENT_CELL).should('contain', 'plain');
  });
;

  it('validates duplicate category/key combinations and shows API errors', () => {
    const key = uniqueKey();
    cy.intercept({ method: 'POST', url: '**/tenant/options', times: 1 }, { statusCode: 409, body: { error: 'duplicate' } }).as(
      'createFail'
    );
    visitPlugin();
    createViaModal(CATEGORY, key, 'v');
    cy.wait('@createFail');
    // the backend error is shown inside the modal, which stays open
    cy.get('[data-cy="add-option--api-error"]').should('be.visible');
    cy.get('[data-cy="add-option--cancel"]').click();
    cy.get(MODAL).should('not.exist');

    // a key that is already in the grid triggers the client-side conflict check
    const key2 = uniqueKey();
    cy.intercept('POST', '**/tenant/options').as('createOption');
    createViaModal(CATEGORY, key2, 'first');
    cy.wait('@createOption');
    rowByKey(key2).should('exist');

    cy.get('[data-cy="tenant-option-management--create"]').click();
    cy.get('[data-cy="add-option--category"]').type(CATEGORY);
    cy.get('[data-cy="add-option--key"]').type(key2);
    cy.get('[data-cy="add-option--value"]').type('second');
    cy.get('[data-cy="add-option--conflict"]')
      .should('be.visible')
      .and('contain', 'Combination of Category and Key exists already.');
    cy.get('[data-cy="add-option--save"]').should('be.disabled');
    cy.get('[data-cy="add-option--cancel"]').click();
  });

  it('edits the value of an existing tenant option', () => {
    const key = uniqueKey();
    cy.intercept('POST', '**/tenant/options').as('createOption');
    cy.intercept('PUT', `**/tenant/options/${CATEGORY}/${key}`).as('updateOption');
    visitPlugin();
    createViaModal(CATEGORY, key, 'before');
    cy.wait('@createOption');

    rowByKey(key).find('[data-cy="c8y-data-grid--edit-button-in-row"]').first().click({ force: true });
    cy.get(MODAL).should('contain', 'Update Tenant Option');
    cy.get('[data-cy="add-option--category"]').should('be.disabled').and('have.value', CATEGORY);
    cy.get('[data-cy="add-option--key"]').should('be.disabled').and('have.value', key);
    cy.get('[data-cy="add-option--value"]').should('have.value', 'before');
    cy.get('[data-cy="add-option--value"]').clear();
    cy.get('[data-cy="add-option--value"]').type('after');
    cy.get('[data-cy="add-option--save"]').click();

    cy.wait('@updateOption').its('request.body').should('deep.include', { value: 'after' });
    cy.get(MODAL).should('not.exist');
    rowByKey(key).find(CONTENT_CELL).should('contain', 'after');
  });

  it('deletes a tenant option after confirmation (cancel keeps it)', () => {
    const key = uniqueKey();
    cy.intercept('POST', '**/tenant/options').as('createOption');
    cy.intercept('DELETE', `**/tenant/options/${CATEGORY}/${key}`).as('deleteOption');
    visitPlugin();
    createViaModal(CATEGORY, key, 'to-delete');
    cy.wait('@createOption');

    rowByKey(key).find('[data-cy="c8y-data-grid--remove-button-in-row"]').first().click({ force: true });
    cy.get(CONFIRM_CANCEL).filter(':visible').last().click();
    rowByKey(key).should('exist');

    interceptConfigUpdate();
    rowByKey(key).find('[data-cy="c8y-data-grid--remove-button-in-row"]').first().click({ force: true });
    cy.get(CONFIRM_OK).filter(':visible').last().click();

    cy.wait('@deleteOption');
    cy.wait('@updateConfig').then(({ request }) => {
      const options = request.body.options as { key: string }[];
      expect(options.map((o) => o.key)).not.to.include(key);
    });
    cy.contains(`${GRID} ${KEY_CELL}`, key).should('not.exist');
  });

  it('shows an error when deleting fails', () => {
    const key = uniqueKey();
    cy.intercept('POST', '**/tenant/options').as('createOption');
    visitPlugin();
    createViaModal(CATEGORY, key, 'stay');
    cy.wait('@createOption');

    cy.intercept('DELETE', `**/tenant/options/${CATEGORY}/${key}`, {
      statusCode: 500,
      body: { error: 'boom' },
    }).as('deleteFail');
    rowByKey(key).find('[data-cy="c8y-data-grid--remove-button-in-row"]').first().click({ force: true });
    cy.get(CONFIRM_OK).filter(':visible').last().click();
    cy.wait('@deleteFail');

    cy.get(ALERT_DANGER).should('contain', 'Could not delete the tenant option.');
    rowByKey(key).should('exist');
  });

  it('adds an existing tenant option to the managed list', () => {
    const key = uniqueKey('existing');
    createTenantOption(CATEGORY, key, 'pre-existing');
    cy.intercept('GET', `**/tenant/options/${CATEGORY}/${key}`).as('getOption');
    visitPlugin();

    cy.get('[data-cy="tenant-option-management--add-existing"]').click();
    cy.get('[data-cy="import-option--import"]').should('be.disabled');
    cy.get('[data-cy="import-option--category"]').type(CATEGORY);
    cy.get('[data-cy="import-option--key"]').type(key);
    cy.get('[data-cy="import-option--import"]').click();

    cy.wait('@getOption');
    cy.get(MODAL).should('not.exist');
    rowByKey(key).find(CONTENT_CELL).should('contain', 'pre-existing');
  });

  it('shows an error when adding a tenant option that does not exist', () => {
    const key = uniqueKey('missing');
    cy.intercept('GET', `**/tenant/options/${CATEGORY}/${key}`).as('getOption');
    visitPlugin();

    cy.get('[data-cy="tenant-option-management--add-existing"]').click();
    cy.get('[data-cy="import-option--category"]').type(CATEGORY);
    cy.get('[data-cy="import-option--key"]').type(key);
    cy.get('[data-cy="import-option--import"]').click();

    cy.wait('@getOption').its('response.statusCode').should('eq', 404);
    cy.get(ALERT_DANGER).should('contain', 'Option could not be imported');
    cy.get('[data-cy="import-option--cancel"]').click();
    cy.get(MODAL).should('not.exist');
  });

  it('adds all tenant options of a category when the key is left empty', () => {
    const category = uniqueKey('bulk');
    const keyA = uniqueKey('a');
    const keyB = uniqueKey('b');
    createTenantOption(category, keyA, 'value-a');
    createTenantOption(category, keyB, 'value-b');
    // an option of another category must not be pulled in
    const foreignKey = uniqueKey('foreign');
    createTenantOption(CATEGORY, foreignKey, 'foreign');
    interceptConfigUpdate();
    visitPlugin();

    cy.get('[data-cy="tenant-option-management--add-existing"]').click();
    cy.get('[data-cy="import-option--category"]').type(category);
    cy.get('[data-cy="import-option--key"]').should('have.value', '');
    cy.get('[data-cy="import-option--import"]').should('be.enabled').click();

    cy.wait('@updateConfig')
      .its('request.body.options')
      .should((options: { category: string; key: string }[]) => {
        const added = options.filter((o) => o.category === category).map((o) => o.key);
        expect(added).to.have.members([keyA, keyB]);
        expect(options.some((o) => o.key === foreignKey)).to.eq(false);
      });
    cy.get(MODAL).should('not.exist');
    cy.get(ALERT_SUCCESS).should('contain', `2 tenant options of category "${category}" were added.`);
    rowByKey(keyA).find(CONTENT_CELL).should('contain', 'value-a');
    rowByKey(keyB).find(CONTENT_CELL).should('contain', 'value-b');
    cy.contains(`${GRID} ${KEY_CELL}`, foreignKey).should('not.exist');
  });

  it('skips already managed options when importing a category again', () => {
    const category = uniqueKey('bulkagain');
    const keyA = uniqueKey('a');
    const keyB = uniqueKey('b');
    createTenantOption(category, keyA, 'value-a');
    interceptConfigUpdate();
    visitPlugin();

    // first import: only A exists
    cy.get('[data-cy="tenant-option-management--add-existing"]').click();
    cy.get('[data-cy="import-option--category"]').type(category);
    cy.get('[data-cy="import-option--import"]').click();
    cy.wait('@updateConfig');
    cy.get(MODAL).should('not.exist');
    rowByKey(keyA).should('exist');

    // second import: B is new, A is already managed and must not be duplicated
    createTenantOption(category, keyB, 'value-b');
    cy.get('[data-cy="tenant-option-management--add-existing"]').click();
    cy.get('[data-cy="import-option--category"]').type(category);
    cy.get('[data-cy="import-option--import"]').click();
    cy.wait('@updateConfig')
      .its('request.body.options')
      .should((options: { category: string; key: string }[]) => {
        const keys = options.filter((o) => o.category === category).map((o) => o.key);
        expect(keys).to.have.length(2);
        expect(keys).to.have.members([keyA, keyB]);
      });
    cy.get(MODAL).should('not.exist');
    cy.get(ALERT_SUCCESS).should('contain', `1 tenant options of category "${category}" were added.`);
    cy.get(`${GRID} ${KEY_CELL}`).filter(`:contains("${keyA}")`).should('have.length', 1);
    rowByKey(keyB).should('exist');

    // third import: nothing new — no write, informative message
    cy.get('[data-cy="tenant-option-management--add-existing"]').click();
    cy.get('[data-cy="import-option--category"]').type(category);
    cy.get('[data-cy="import-option--import"]').click();
    cy.get(MODAL).should('not.exist');
    cy.get(ALERT_SUCCESS).should(
      'contain',
      `All tenant options of category "${category}" are already managed.`
    );
    cy.get(`${GRID} ${KEY_CELL}`).filter(`:contains("${keyA}")`).should('have.length', 1);
  });

  it('shows an error when a category has no options or listing fails', () => {
    const category = uniqueKey('emptycat');
    visitPlugin();

    cy.get('[data-cy="tenant-option-management--add-existing"]').click();
    cy.get('[data-cy="import-option--category"]').type(category);
    cy.get('[data-cy="import-option--import"]').click();
    cy.get(ALERT_DANGER).should('contain', 'Option could not be imported');
    cy.get(MODAL).should('be.visible');

    cy.intercept('GET', '**/tenant/options?*', { statusCode: 500, body: { error: 'boom' } }).as(
      'listFail'
    );
    cy.get('[data-cy="import-option--import"]').click();
    cy.wait('@listFail');
    cy.get(ALERT_DANGER).should('have.length.at.least', 1);
    cy.get(MODAL).should('be.visible');
    cy.get('[data-cy="import-option--cancel"]').click();
    cy.get(MODAL).should('not.exist');
  });

  it('exports selected tenant options to a JSON file', () => {
    const key = uniqueKey('export');
    cy.intercept('POST', '**/tenant/options').as('createOption');
    visitPlugin();
    createViaModal(CATEGORY, key, 'exported-value');
    cy.wait('@createOption');

    cy.get('[data-cy="tenant-option-management--export"]').click();
    cy.get(MODAL).should('contain', 'Export Tenant Option');
    cy.contains(`${MODAL} ${KEY_CELL}`, key).parents(ROW).find(CHECKBOX).click({ force: true });
    cy.get('[data-cy="export-option--export"]').click();

    cy.get(MODAL).should('not.exist');
    cy.readFile(`${Cypress.config('downloadsFolder')}/export_tenant_options.json`).should(
      'deep.equal',
      [{ category: CATEGORY, key, value: 'exported-value' }]
    );
  });

  it('imports new and conflicting tenant options from a JSON file', () => {
    const existingKey = uniqueKey('conflict');
    const newKey = uniqueKey('new');
    createTenantOption(CATEGORY, existingKey, 'old');
    cy.intercept('POST', '**/tenant/options').as('createOption');
    cy.intercept('PUT', `**/tenant/options/${CATEGORY}/${existingKey}`).as('updateOption');
    visitPlugin();

    cy.get('[data-cy="tenant-option-management--import"]').click();
    cy.get('[data-cy="file-import--file"]').selectFile(
      {
        contents: Cypress.Buffer.from(
          JSON.stringify([
            { category: CATEGORY, key: newKey, value: 'new-value' },
            { category: CATEGORY, key: existingKey, value: 'overwritten' },
          ])
        ),
        fileName: 'options.json',
        mimeType: 'application/json',
      },
      { force: true }
    );

    cy.contains(`${MODAL} ${ROW}`, newKey).should('contain', 'NEW');
    cy.contains(`${MODAL} ${ROW}`, existingKey).should('contain', 'CONFLICT');

    cy.contains(`${MODAL} ${ROW}`, newKey).find(CHECKBOX).click({ force: true });
    cy.contains(`${MODAL} ${ROW}`, existingKey).find(CHECKBOX).click({ force: true });
    // selecting a conflicting entry asks for overwrite confirmation
    cy.get(CONFIRM_OK).filter(':visible').last().click();
    cy.contains(`${MODAL} ${ROW}`, existingKey).should('contain', 'OVERWRITE');

    cy.get('[data-cy="file-import--import"]').click();
    cy.wait('@createOption')
      .its('request.body')
      .should('deep.include', { category: CATEGORY, key: newKey, value: 'new-value' });
    cy.wait('@updateOption').its('request.body').should('deep.include', { value: 'overwritten' });

    cy.get(ALERT_SUCCESS).should('contain', 'Tenant options imported successfully.');
    cy.get(MODAL).should('not.exist');
    rowByKey(newKey).find(CONTENT_CELL).should('contain', 'new-value');
    rowByKey(existingKey).find(CONTENT_CELL).should('contain', 'overwritten');
  });

  it('rejects invalid import files and empty selections', () => {
    visitPlugin();
    cy.get('[data-cy="tenant-option-management--import"]').click();

    cy.get('[data-cy="file-import--file"]').selectFile(
      { contents: Cypress.Buffer.from('{"not":"an array"}'), fileName: 'x.json', mimeType: 'application/json' },
      { force: true }
    );
    cy.get(ALERT_DANGER).should('contain', 'Invalid file content. Please select a valid JSON file.');

    cy.get('[data-cy="file-import--file"]').selectFile(
      { contents: Cypress.Buffer.from('hello'), fileName: 'x.txt', mimeType: 'text/plain' },
      { force: true }
    );
    cy.get(ALERT_DANGER).should('contain', 'Invalid file type. Please select a JSON file.');

    cy.get('[data-cy="file-import--import"]').click();
    cy.get(ALERT_DANGER).should('contain', 'Please select at least one item to import.');
    cy.get('[data-cy="file-import--cancel"]').click();
    cy.get(MODAL).should('not.exist');
  });
});
