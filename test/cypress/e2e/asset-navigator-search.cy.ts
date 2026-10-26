/// <reference types="cypress" />


/**
 * Asset Navigator — global search (`globalSearchViewProviders`): header search button and the
 * ⌘K / Ctrl+K palette over all assets and devices. Runs against the tenant mock (windy-dev).
 *
 * Covered:
 *  - header button opens / closes the palette (button, backdrop, close button, Escape)
 *  - the ⌘K / Ctrl+K chord opens the palette from anywhere
 *  - typing finds assets and devices (exact, highlighted; and abbreviated / subsequence)
 *  - clicking a device result routes to the device, an asset result to the group route
 *  - keyboard: ↓ / ↑ move the highlight, Enter opens the highlighted entry
 *  - shortcut chips (alarm severity, asset type) → filter chips; remove via × and Backspace
 *  - "Add filter" suggestions for typed text, accepted with →
 *  - recent entries remembered and shown for an empty query
 *  - Escape clears the query first, then closes; empty-result state
 *
 * Names and ids are read from the mock inventory at runtime.
 */

const TRIGGER = 'ps-search-trigger button.main-header-button';
const PALETTE = '[data-cy="asset-search--palette"]';
const INPUT = '[data-cy="asset-search--input"]';
const RESULT = '[data-cy="asset-search--result"]';
const CHIP = '[data-cy="asset-search--chip"]';
const GROUP_LABEL = '[data-cy="asset-search--group-label"]';

interface MO {
  id: string;
  name: string;
  type: string;
}

interface World {
  device: MO; // a pure device (no c8y_IsAsset): routes to /device/<id>
  turbine: MO; // an asset: routes to /group/<id>
  all: MO[];
}

function loadWorld(): Cypress.Chainable<World> {
  return cy.request('/inventory/managedObjects?pageSize=2000&withChildren=false').then((res) => {
    const all = res.body.managedObjects as (MO & Record<string, unknown>)[];
    const device = all.find(
      (mo) => 'c8y_IsDevice' in mo && !('c8y_IsAsset' in mo) && !('c8y_IsDeviceGroup' in mo),
    ) as MO;
    const turbine = all.find((mo) => mo.type === 'wind_turbine') as MO;
    return { device, turbine, all };
  });
}

function visitHome() {
  cy.visitShellAndWaitForSelector('', 'en', TRIGGER);
}

function openPalette() {
  visitHome();
  cy.get(TRIGGER).click();
  cy.get(PALETTE).should('be.visible');
  cy.get(INPUT).should('be.focused');
}

/**
 * The first search assembles the corpus (fleet sweep + device fetch) before it can answer, so
 * the first result-dependent assertion of a test gets a longer timeout.
 */
const CORPUS = { timeout: 30000 };

function resultNamed(name: string) {
  return cy.contains(`${RESULT} .ps-search-result__name`, name, CORPUS).closest(RESULT);
}

describe('Asset Navigator — global search', () => {
  let world: World;

  before(() => {
    cy.request('POST', '/_mock/reset');
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
    cy.clearLocalStorage();
    loadWorld().then((w) => (world = w));
  });

  it('opens and closes the palette from the header button, backdrop and close button', () => {
    visitHome();
    cy.get(TRIGGER)
      .should('have.attr', 'aria-expanded', 'false')
      .and('have.attr', 'title')
      .and('match', /^Search \((⌘|Ctrl)\+K\)$/);
    cy.get(PALETTE).should('not.exist');

    cy.get(TRIGGER).click();
    cy.get(PALETTE).should('be.visible');
    cy.get(TRIGGER).should('have.attr', 'aria-expanded', 'true');
    cy.get(INPUT).should('be.focused').and('have.attr', 'placeholder').and('match', /K\)$/);

    // Cypress checks a fixed element's visibility at its centre, which the palette covers;
    // the click itself lands on the free bottom-right corner.
    cy.get('.ps-search-backdrop').click('bottomRight', { force: true });
    cy.get(PALETTE).should('not.exist');

    cy.get(TRIGGER).click();
    cy.get('[data-cy="asset-search--clear"]').should('have.attr', 'title', 'Close').click();
    cy.get(PALETTE).should('not.exist');
  });

  it('stays open while the shell changes the URL right after load', () => {
    // Cockpit's home route appends its global-context query params shortly after load, and the
    // action bar re-creates every header action on that URL change. The palette's open state
    // lives in a root service, so the re-created trigger renders it again.
    visitHome();
    cy.get(TRIGGER).click();
    cy.get(PALETTE).should('be.visible');
    cy.location('hash').should('include', 'globalContextRefreshMode');
    cy.get(PALETTE).should('be.visible');
  });

  it('opens the palette with the ⌘K / Ctrl+K chord', () => {
    visitHome();
    cy.get(PALETTE).should('not.exist');
    cy.get(TRIGGER)
      .invoke('attr', 'title')
      .then((title) => {
        const mac = String(title).includes('⌘');
        cy.get('body').type(mac ? '{cmd}k' : '{ctrl}k');
      });
    cy.get(PALETTE).should('be.visible');
    cy.get(INPUT).should('be.focused');
  });

  it('finds a device by name and routes to the device on click', () => {
    openPalette();
    cy.get(INPUT).type(world.device.name);
    cy.contains(GROUP_LABEL, 'Assets and devices', CORPUS).should('be.visible');
    resultNamed(world.device.name).should('be.visible').click();

    cy.location('hash').should('contain', `/device/${world.device.id}`);
    cy.get(PALETTE).should('not.exist');
  });

  it('finds an asset by an abbreviation and routes to the group view', () => {
    openPalette();
    // drop every separator and the model suffix: "CUWTG01 · Enercon …" → "cuwtg01"
    const code = world.turbine.name.split(' ')[0].toLowerCase();
    cy.get(INPUT).type(code);
    resultNamed(world.turbine.name).find('.label').should('contain', world.turbine.type);
    resultNamed(world.turbine.name).click();
    cy.location('hash').should('contain', `/group/${world.turbine.id}`);
  });

  it('moves the highlight with the arrow keys and opens the highlighted entry with Enter', () => {
    openPalette();
    // "CUWTG06-Main-Controller" → "CUWTG06": the controller and its turbine both match
    cy.get(INPUT).type(world.device.name.split('-')[0]);
    cy.get(RESULT, CORPUS).should('have.length.greaterThan', 1);

    cy.get(`${RESULT}[aria-selected="true"]`).should('have.attr', 'data-entry-index', '0');
    cy.get(INPUT).type('{downArrow}');
    cy.get(`${RESULT}[aria-selected="true"]`).should('have.attr', 'data-entry-index', '1');
    cy.get(INPUT).type('{upArrow}');
    cy.get(`${RESULT}[aria-selected="true"]`).should('have.attr', 'data-entry-index', '0');
    // ↑ from the first entry wraps to the last
    cy.get(INPUT).type('{upArrow}');
    cy.get(RESULT)
      .last()
      .should('have.attr', 'aria-selected', 'true');

    // Home, then ↓ to the exact device result, and open it from the keyboard
    cy.get(INPUT).type('{home}');
    cy.get(`${RESULT}[aria-selected="true"]`).should('have.attr', 'data-entry-index', '0');
    resultNamed(world.device.name)
      .invoke('attr', 'data-entry-index')
      .then((index) => {
        for (let i = 0; i < Number(index); i++) cy.get(INPUT).type('{downArrow}');
      });
    resultNamed(world.device.name).should('have.attr', 'aria-selected', 'true');
    cy.get(INPUT).type('{enter}');
    cy.location('hash').should('contain', `/device/${world.device.id}`);
    cy.get(PALETTE).should('not.exist');
  });

  it('turns shortcut chips into filters and removes them via × and Backspace', () => {
    // Type chips come from the DTM asset catalog — no microservices on the mock, so stub it.
    cy.intercept('GET', '**/service/dtm/definitions/assets*', {
      definitions: [
        { identifier: 'wind_turbine', jsonSchema: { title: 'Wind turbine' } },
        { identifier: 'pv_inverter', jsonSchema: { title: 'PV inverter' } },
      ],
    }).as('dtmAssets');
    cy.intercept('GET', '**/service/dtm/definitions/properties*', { definitions: [] });
    openPalette();
    cy.wait('@dtmAssets');
    cy.get('[data-cy="asset-search--severity"]').should('have.length', 4);
    cy.get('[data-cy="asset-search--facet"]', CORPUS).should('have.length', 2);

    // type facet → chip, results restricted to that type
    cy.contains('[data-cy="asset-search--facet"]', 'Wind turbine').click();
    cy.get(CHIP).should('have.length', 1).and('contain', 'Type');
    cy.get(RESULT).should('have.length.greaterThan', 0);
    cy.get(`${RESULT} .ps-search-result__type`).each(($type) => {
      expect($type.text().trim()).to.eq('wind_turbine');
    });
    cy.get('[data-cy="asset-search--chip-remove"]').click();
    cy.get(CHIP).should('not.exist');

    // severity chip → chip; Backspace on an empty input removes the last chip
    cy.get('[data-cy="asset-search--severity"]').first().click();
    cy.get('[data-cy="asset-search--severity"]').first().should('have.attr', 'aria-pressed', 'true');
    cy.get(CHIP).should('have.length', 1).and('contain', 'Alarm');
    cy.get(INPUT).focus().type('{backspace}');
    cy.get(CHIP).should('not.exist');
  });

  it('suggests a filter for the typed text and adds it with →', () => {
    openPalette();
    cy.get(INPUT).type('wind turbine');
    cy.contains(GROUP_LABEL, 'Add filter', CORPUS).should('be.visible');
    cy.get(`${RESULT}[aria-label^="Add filter: Type"]`).should('exist');
    cy.get(INPUT).type('{rightArrow}');
    cy.get(CHIP).should('have.length', 1).and('contain', 'Type');
  });

  it('remembers opened entries and lists them as recent for an empty query', () => {
    cy.intercept('PUT', '**/user/currentUser').as('savePreference');
    openPalette();
    cy.get(INPUT).type(world.device.name);
    resultNamed(world.device.name).click();
    cy.wait('@savePreference');
    cy.location('hash').should('contain', `/device/${world.device.id}`);

    visitHome();
    cy.get(TRIGGER).click();
    cy.contains(GROUP_LABEL, 'Recent').should('be.visible');
    resultNamed(world.device.name).should('exist');
  });

  it('clears the query with Escape first, then closes; shows the empty state', () => {
    openPalette();
    cy.get(INPUT).type('zzqqxxyy-no-such-thing');
    cy.get('[data-cy="asset-search--empty"]', CORPUS).should(
      'contain',
      'No assets or devices match that search.',
    );
    cy.get(RESULT).should('not.exist');
    cy.get('[data-cy="asset-search--clear"]').should('have.attr', 'title', 'Clear search');

    cy.get(INPUT).type('{esc}');
    cy.get(INPUT).should('have.value', '');
    cy.get(PALETTE).should('be.visible');
    cy.get('[data-cy="asset-search--empty"]').should('not.exist');

    cy.get(INPUT).type('{esc}');
    cy.get(PALETTE).should('not.exist');
  });
});
