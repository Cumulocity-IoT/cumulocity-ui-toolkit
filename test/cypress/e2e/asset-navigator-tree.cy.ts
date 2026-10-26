/// <reference types="cypress" />


/**
 * Asset Navigator — "Tree" navigator entry + explorer drawer (`assetTreeNavigatorViewProviders`).
 * Runs against the tenant mock (windy-dev world: energy site → subsystems → turbines/inverters …).
 *
 * Covered:
 *  - navigator entry "Tree" toggles the drawer; close button and backdrop click close it
 *  - pin / unpin: pinned drawer has no backdrop and survives a reload (UserPreferencesService)
 *  - resize grip (keyboard: ArrowRight / ArrowLeft change the width, clamped, persisted)
 *  - hierarchy rendering from the world (site → subsystem → turbine), expand all / collapse all
 *  - filter inside the drawer (exact + fuzzy), empty state, reset
 *  - clicking a row routes to the asset (group route) and shows the path header
 *  - footer turbine count, status dots on rows
 *  - detail panel (info button): title, Open
 *
 * Names and ids are read from the inventory at runtime — the world is re-pulled in CI.
 */

const NAV_NODE = 'c8y-navigator-node button[data-cy="Tree"]';
const DRAWER = '[data-cy="asset-navigator--drawer"]';
const BACKDROP = '[data-cy="asset-navigator--backdrop"]';
const ROW = '[data-cy="asset-navigator--row"]';
const FILTER = '[data-cy="asset-navigator--filter"]';
const PIN = '[data-cy="asset-navigator--pin"]';
const GRIP = '[data-cy="asset-navigator--grip"]';

interface MO {
  id: string;
  name: string;
  type: string;
}

interface World {
  site: MO;
  subsystem: MO;
  turbine: MO;
  turbineCount: number;
  assetCount: number;
}

/** Site (root asset) → a subsystem with turbines → one turbine, read from the mock inventory. */
function loadWorld(): Cypress.Chainable<World> {
  return cy.request('/inventory/managedObjects?fragmentType=c8y_IsAsset&pageSize=2000').then((res) => {
    const assets = res.body.managedObjects as (MO & {
      childAssets?: { references: { managedObject: { id: string } }[] };
    })[];
    const parentOf = (id: string) =>
      assets.find((a) => (a.childAssets?.references ?? []).some((r) => r.managedObject.id === id));
    const turbines = assets.filter((a) => a.type === 'wind_turbine');
    const turbine = turbines.find((t) => parentOf(t.id) && parentOf(parentOf(t.id)!.id)) as MO;
    const subsystem = parentOf(turbine.id) as MO;
    const site = parentOf(subsystem.id) as MO;

    const inSite = (id: string): boolean => id === site.id || (!!parentOf(id) && inSite(parentOf(id)!.id));
    const assetCount = assets.filter((a) => inSite(a.id)).length;

    return { site, subsystem, turbine, turbineCount: turbines.length, assetCount };
  });
}

function rowNamed(name: string) {
  return cy.contains(`${ROW} [data-cy="asset-navigator--row-name"]`, name).closest(ROW);
}

function openDrawer() {
  cy.visitApp('', { language: 'en', waitFor: NAV_NODE });
  cy.get(NAV_NODE).click();
  cy.get(DRAWER).should('be.visible');
  cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);
}

describe('Asset Navigator — tree drawer', () => {
  let world: World;

  before(() => {
    cy.request('POST', '/_mock/reset');
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
    cy.clearLocalStorage();
    loadWorld().then((w) => (world = w));
  });

  it('opens the drawer from the "Tree" navigator entry and closes it via button, backdrop and entry', () => {
    cy.visitApp('', { language: 'en', waitFor: '#navigator' });
    cy.get(DRAWER).should('not.exist');

    cy.get(NAV_NODE).should('be.visible').click();
    cy.get(DRAWER).should('be.visible').and('contain', 'Assets');
    cy.get('[data-cy="asset-navigator--close"]').click();
    cy.get(DRAWER).should('not.exist');

    cy.get(NAV_NODE).click();
    cy.get(DRAWER).should('be.visible');
    cy.get(BACKDROP).should('exist').click('right', { force: true });
    cy.get(DRAWER).should('not.exist');

    // the entry itself toggles
    cy.get(NAV_NODE).click();
    cy.get(DRAWER).should('be.visible');
    cy.get(NAV_NODE).click({ force: true });
    cy.get(DRAWER).should('not.exist');
  });

  it('pins the drawer (no backdrop, survives a reload) and unpins it again', () => {
    openDrawer();
    cy.intercept('PUT', '**/user/currentUser').as('savePreference');
    cy.get(PIN).should('have.attr', 'aria-pressed', 'false').click();
    cy.wait('@savePreference');
    cy.get(PIN).should('have.attr', 'aria-pressed', 'true').and('have.attr', 'title', 'Unpin drawer');
    cy.get(BACKDROP).should('not.exist');

    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    cy.get(PIN).should('have.attr', 'aria-pressed', 'true');
    cy.get(BACKDROP).should('not.exist');

    cy.get(PIN).click();
    cy.wait('@savePreference');
    cy.get(PIN).should('have.attr', 'aria-pressed', 'false');
    cy.get(BACKDROP).should('exist');

    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    cy.get(PIN).should('have.attr', 'aria-pressed', 'false');
  });

  it('resizes the drawer with the grip (keyboard) and keeps the width', () => {
    cy.intercept('PUT', '**/user/currentUser').as('savePreference');
    openDrawer();
    cy.get(GRIP)
      .invoke('attr', 'aria-valuenow')
      .then((initial) => {
        const start = Number(initial);
        cy.get(GRIP).focus().trigger('keydown', { key: 'ArrowRight', shiftKey: true });
        cy.get(GRIP).should('have.attr', 'aria-valuenow', String(start + 40));
        cy.get(DRAWER).invoke('outerWidth').should('be.closeTo', start + 40, 1);
        cy.get(GRIP).trigger('keydown', { key: 'ArrowLeft' });
        cy.get(GRIP).should('have.attr', 'aria-valuenow', String(start + 30));
        cy.wait(['@savePreference', '@savePreference']);

        cy.reload();
        cy.get(NAV_NODE, { timeout: 60000 }).click();
        cy.get(GRIP).should('have.attr', 'aria-valuenow', String(start + 30));

        // clamped at the maximum
        cy.get(GRIP).invoke('attr', 'aria-valuemax').then((max) => {
          for (let i = 0; i < 40; i++) {
            cy.get(GRIP).trigger('keydown', { key: 'ArrowRight', shiftKey: true });
          }
          cy.get(GRIP).should('have.attr', 'aria-valuenow', String(max));
        });
      });
  });

  it('renders the hierarchy site → subsystem → turbine and expands / collapses all', () => {
    openDrawer();
    cy.get('[data-cy="asset-navigator--collapse-all"]').click();
    cy.get(ROW).should('have.length', 1);
    rowNamed(world.site.name)
      .should('have.attr', 'aria-level', '1')
      .and('have.attr', 'aria-expanded', 'false');
    cy.get('[data-cy="asset-navigator--summary"]').should('contain', 'Hierarchy · 1 node');
    cy.get('[data-cy="asset-navigator--collapse-all"]').should('be.disabled');

    // the twisty opens one level: the subsystems, still collapsed
    rowNamed(world.site.name).find('[data-cy="asset-navigator--row-toggle"]').click();
    rowNamed(world.site.name).should('have.attr', 'aria-expanded', 'true');
    rowNamed(world.subsystem.name)
      .should('have.attr', 'aria-level', '2')
      .and('have.attr', 'aria-expanded', 'false');
    cy.contains(ROW, world.turbine.name).should('not.exist');

    rowNamed(world.subsystem.name).find('[data-cy="asset-navigator--row-toggle"]').click();
    rowNamed(world.turbine.name).should('have.attr', 'aria-level', '3');

    // expand all: every asset of the site is a visible node
    cy.get('[data-cy="asset-navigator--expand-all"]').should('be.enabled').click();
    cy.get('[data-cy="asset-navigator--summary"]').should(
      'contain',
      `Hierarchy · ${world.assetCount} nodes`,
    );
    cy.get('[data-cy="asset-navigator--expand-all"]').should('be.disabled');

    cy.get('[data-cy="asset-navigator--collapse-all"]').should('be.enabled').click();
    cy.get(ROW).should('have.length', 1);
  });

  it('shows the turbine count in the footer and a status dot on every row', () => {
    openDrawer();
    cy.get('[data-cy="asset-navigator--footer"]').should(
      'contain',
      `${world.turbineCount} turbines`,
    );
    cy.get(ROW).each(($row) => {
      cy.wrap($row).find('[data-cy="asset-navigator--row-status"]').should('exist');
    });
  });

  it('filters the tree (exact and fuzzy), shows the empty state and resets', () => {
    openDrawer();
    const code = world.turbine.name.split(' ')[0]; // e.g. "CUWTG01"

    cy.get(FILTER).type(code);
    rowNamed(world.turbine.name).should('exist').find('mark').should('contain', code);
    // ancestors stay visible for context
    rowNamed(world.site.name).should('exist');
    rowNamed(world.subsystem.name).should('exist');
    cy.get(`${ROW}`).should('have.length.lessThan', world.turbineCount);

    cy.get(FILTER).clear().type('zzqqxxyy-nothing');
    cy.get('[data-cy="asset-navigator--empty"]').should('contain', 'No asset matches the filter.');
    cy.get(ROW).should('not.exist');

    cy.get('[data-cy="asset-navigator--filter-reset"]')
      .should('have.attr', 'title', 'Reset')
      .click();
    cy.get(FILTER).should('have.value', '');
    cy.get('[data-cy="asset-navigator--filter-reset"]').should('have.attr', 'title', 'Search');
    rowNamed(world.site.name).should('exist');
    cy.get('[data-cy="asset-navigator--empty"]').should('not.exist');
  });

  it('falls back to a fuzzy match and says so', () => {
    openDrawer();
    // a transposition in the site name ("Cuxhaven" → "Cuxhvaen"): no literal, prefix or
    // subsequence match, only the widened typo pass finds it
    const word = world.site.name.split(' ')[0];
    expect(word.length, 'site name word long enough for a typo').to.be.greaterThan(5);
    const typo = word.slice(0, 4) + word[5] + word[4] + word.slice(6);
    cy.get(FILTER).type(typo);
    cy.get('[data-cy="asset-navigator--fuzzy-hint"]').should(
      'contain',
      'No exact match — showing similar names.',
    );
    rowNamed(world.site.name).should('exist');
  });

  it('navigates to the asset on row click, marks it current and shows the path header', () => {
    openDrawer();
    cy.get(FILTER).type(world.turbine.name.split(' ')[0]);
    rowNamed(world.turbine.name).click();

    cy.location('hash').should('contain', `/group/${world.turbine.id}`);
    cy.get(DRAWER).should('be.visible');
    rowNamed(world.turbine.name)
      .should('have.attr', 'aria-selected', 'true')
      .find('[data-cy="asset-navigator--row-current"]')
      .should('contain', 'Current');

    cy.get('[data-cy="asset-navigator--path"]')
      .should('contain', world.site.name)
      .and('contain', world.subsystem.name)
      .and('contain', world.turbine.name)
      .find('.ps-drawer__path-last')
      .should('contain', world.turbine.name);
  });

  it('opens the detail panel from the info button and opens the asset from there', () => {
    openDrawer();
    cy.get(FILTER).type(world.turbine.name.split(' ')[0]);
    rowNamed(world.turbine.name).find('[data-cy="asset-navigator--row-info"]').click({ force: true });

    cy.get('[data-cy="asset-navigator--detail"]').should('be.visible');
    cy.get('[data-cy="asset-navigator--detail-title"]').should('contain', world.turbine.name);
    cy.get('[data-cy="asset-navigator--detail-open"]').click();
    cy.location('hash').should('contain', `/group/${world.turbine.id}`);
  });

  it('resizes the drawer by dragging the grip', () => {
    openDrawer();
    cy.get(GRIP)
      .invoke('attr', 'aria-valuenow')
      .then((initial) => {
        const start = Number(initial);
        cy.get(GRIP).then(($grip) => {
          const x = $grip[0].getBoundingClientRect().left;
          cy.get(GRIP).trigger('pointerdown', { clientX: x, clientY: 300, button: 0 });
          cy.window().trigger('pointermove', { clientX: x + 100, clientY: 300 });
          cy.window().trigger('pointerup', { clientX: x + 100, clientY: 300 });
        });
        cy.get(GRIP).should('have.attr', 'aria-valuenow', String(start + 100));
        cy.get(DRAWER).invoke('outerWidth').should('be.closeTo', start + 100, 1);
      });
  });

  it('navigates the tree with the keyboard, hands typing to the filter and closes on Escape', () => {
    openDrawer();
    cy.get('[data-cy="asset-navigator--collapse-all"]').click();
    cy.get(ROW).should('have.length', 1);
    const TREE = `${DRAWER} [role="tree"][aria-label="Asset hierarchy"]`;

    cy.get(TREE).focus().type('{downArrow}');
    cy.get(TREE).should('have.attr', 'aria-activedescendant', `ps-tree-row-${world.site.id}`);
    cy.get(TREE).type('{rightArrow}');
    rowNamed(world.site.name).should('have.attr', 'aria-expanded', 'true');
    cy.get(TREE).type('{rightArrow}');
    cy.get(TREE).should('not.have.attr', 'aria-activedescendant', `ps-tree-row-${world.site.id}`);
    // ← walks back to the parent, → steps into the first child again
    cy.get(TREE).type('{leftArrow}');
    cy.get(TREE).should('have.attr', 'aria-activedescendant', `ps-tree-row-${world.site.id}`);
    cy.get(TREE).type('{rightArrow}');
    cy.get(TREE)
      .invoke('attr', 'aria-activedescendant')
      .should('not.eq', `ps-tree-row-${world.site.id}`)
      .then((active) => {
        const id = String(active).replace('ps-tree-row-', '');
        cy.get(`#${active}`).should('have.attr', 'aria-level', '2');
        // Enter opens the focused row; the drawer stays open
        cy.get(TREE).type('{enter}');
        cy.location('hash').should('contain', `/group/${id}`);
        cy.get(DRAWER).should('be.visible');
      });

    // keyboard focus opens the row's detail panel; Escape closes the innermost level first
    cy.get(TREE).focus().type('{upArrow}{downArrow}');
    cy.get('[data-cy="asset-navigator--detail"]').should('be.visible');
    cy.get(TREE).type('{esc}');
    cy.get('[data-cy="asset-navigator--detail"]').should('not.exist');
    cy.get(DRAWER).should('be.visible');
    cy.get(TREE).type('{esc}');
    cy.get(DRAWER).should('not.exist');

    // a printable key on the tree is type-ahead into the filter
    cy.get(NAV_NODE).click();
    cy.get(TREE).focus().type('w');
    cy.get(FILTER).should('have.value', 'w');
  });

  it('opens the detail panel on hover and pins the asset to "Pinned & Recent"', () => {
    openDrawer();
    cy.get('[data-cy="asset-navigator--quick-access-counts"]')
      .invoke('text')
      .should('match', /^\s*0\+\d+\s*$/);
    cy.get(FILTER).type(world.turbine.name.split(' ')[0]);
    rowNamed(world.turbine.name).trigger('mouseenter');

    cy.get('[data-cy="asset-navigator--detail"]').should('be.visible');
    cy.get('[data-cy="asset-navigator--detail-title"]').should('contain', world.turbine.name);
    cy.get('[data-cy="asset-navigator--detail-pin"]').should('contain', 'Pin').click();
    cy.get('[data-cy="asset-navigator--detail-pin"]').should('contain', 'Unpin');

    rowNamed(world.turbine.name).find('.ps-tree-row__pin').should('exist');
    cy.get('[data-cy="asset-navigator--quick-access-counts"]')
      .invoke('text')
      .should('match', /^\s*1\+\d+\s*$/);

    // the detail panel's Alarms action routes to the asset's alarm tab
    cy.get('[data-cy="asset-navigator--detail-alarms"]').click();
    cy.location('hash').should('contain', `/group/${world.turbine.id}/alarms`);
  });
});
