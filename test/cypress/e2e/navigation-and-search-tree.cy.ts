/// <reference types="cypress" />


/**
 * Asset Navigator — "Tree" navigator entry + explorer drawer (`assetTreeNavigatorViewProviders`).
 * Runs against the tenant mock (windy-dev world: a site → subsystems → leaf assets → devices).
 *
 * Covered:
 *  - navigator entry "Tree" toggles the drawer; close button and backdrop click close it
 *  - pin / unpin: pinned drawer has no backdrop and survives a reload (UserPreferencesService)
 *  - resize grip (keyboard: ArrowRight / ArrowLeft change the width, clamped, persisted)
 *  - hierarchy rendering from the world (site → subsystem → leaf), expand all / collapse all
 *  - filter inside the drawer (exact + fuzzy), empty state, reset
 *  - clicking a row routes to the asset (group route) and shows the path header
 *  - footer device count, status dots on rows
 *  - detail panel (info button): title, Open
 *
 * Names and ids are read from the inventory at runtime — the world is re-pulled in CI.
 */

const NAV_NODE = 'c8y-navigator-node button[data-cy="Tree"]';
const DRAWER = '[data-cy="navigation-and-search--drawer"]';
const BACKDROP = '[data-cy="navigation-and-search--backdrop"]';
const ROW = '[data-cy="navigation-and-search--row"]';
const FILTER = '[data-cy="navigation-and-search--filter"]';
const PIN = '[data-cy="navigation-and-search--pin"]';
const GRIP = '[data-cy="navigation-and-search--grip"]';

interface MO {
  id: string;
  name: string;
  type: string;
}

interface World {
  site: MO;
  subsystem: MO;
  leaf: MO;
  leafCount: number;
  deviceCount: number;
  assetCount: number;
}

/** Site (root asset) → a subsystem with leaves → one leaf asset, read from the mock inventory. */
function loadWorld(): Cypress.Chainable<World> {
  return cy.request('/inventory/managedObjects?pageSize=2000&withChildren=true').then((res) => {
    const all = res.body.managedObjects as (MO & {
      c8y_IsAsset?: object;
      c8y_IsDevice?: object;
      childAssets?: { references: { managedObject: { id: string } }[] };
    })[];
    const assets = all.filter((mo) => mo.c8y_IsAsset);
    const plainDevices = all.filter((mo) => mo.c8y_IsDevice && !mo.c8y_IsAsset);
    const parentOf = (id: string) =>
      assets.find((a) => (a.childAssets?.references ?? []).some((r) => r.managedObject.id === id));
    const hasChildAsset = (mo: (typeof assets)[number]) =>
      (mo.childAssets?.references ?? []).some((r) => assets.some((a) => a.id === r.managedObject.id));
    const leaves = assets.filter((a) => !hasChildAsset(a));
    const leaf = leaves.find((t) => parentOf(t.id) && parentOf(parentOf(t.id)!.id)) as MO;
    const subsystem = parentOf(leaf.id) as MO;
    const site = parentOf(subsystem.id) as MO;

    const inSite = (id: string): boolean => id === site.id || (!!parentOf(id) && inSite(parentOf(id)!.id));
    const assetCount = assets.filter((a) => inSite(a.id)).length;
    const leafCount = leaves.filter((a) => inSite(a.id)).length;
    // devices are counted below the asset that references them
    const deviceCount = plainDevices.filter((d) => {
      const parent = parentOf(d.id);
      return !!parent && inSite(parent.id);
    }).length;

    return { site, subsystem, leaf, leafCount, deviceCount, assetCount };
  });
}

function rowNamed(name: string) {
  return cy.contains(`${ROW} [data-cy="navigation-and-search--row-name"]`, name).closest(ROW);
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
    cy.get('[data-cy="navigation-and-search--close"]').click();
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

  it('renders the hierarchy site → subsystem → leaf and expands / collapses all', () => {
    openDrawer();
    cy.get('[data-cy="navigation-and-search--collapse-all"]').click();
    cy.get(ROW).should('have.length', 1);
    rowNamed(world.site.name)
      .should('have.attr', 'aria-level', '1')
      .and('have.attr', 'aria-expanded', 'false');
    cy.get('[data-cy="navigation-and-search--summary"]').should('contain', 'Hierarchy · 1 node');
    cy.get('[data-cy="navigation-and-search--collapse-all"]').should('be.disabled');

    // the twisty opens one level: the subsystems, still collapsed
    rowNamed(world.site.name).find('[data-cy="navigation-and-search--row-toggle"]').click();
    rowNamed(world.site.name).should('have.attr', 'aria-expanded', 'true');
    rowNamed(world.subsystem.name)
      .should('have.attr', 'aria-level', '2')
      .and('have.attr', 'aria-expanded', 'false');
    cy.contains(ROW, world.leaf.name).should('not.exist');

    rowNamed(world.subsystem.name).find('[data-cy="navigation-and-search--row-toggle"]').click();
    rowNamed(world.leaf.name).should('have.attr', 'aria-level', '3');

    // expand all: every asset of the site is a visible node
    cy.get('[data-cy="navigation-and-search--expand-all"]').should('be.enabled').click();
    cy.get('[data-cy="navigation-and-search--summary"]').should(
      'contain',
      `Hierarchy · ${world.assetCount} nodes`,
    );
    cy.get('[data-cy="navigation-and-search--expand-all"]').should('be.disabled');

    cy.get('[data-cy="navigation-and-search--collapse-all"]').should('be.enabled').click();
    cy.get(ROW).should('have.length', 1);
  });

  it('shows the device count in the footer and a status dot on every row', () => {
    openDrawer();
    // no Digital Twin Manager on the mock: the footer counts devices
    cy.get('[data-cy="navigation-and-search--footer-count"]').should(
      'have.text',
      `${world.deviceCount} devices`,
    );
    cy.get(ROW).each(($row) => {
      cy.wrap($row).find('[data-cy="navigation-and-search--row-status"]').should('exist');
    });
  });

  it('filters the tree (exact and fuzzy), shows the empty state and resets', () => {
    openDrawer();
    const code = world.leaf.name.split(' ')[0];

    cy.get(FILTER).type(code);
    rowNamed(world.leaf.name).should('exist').find('mark').should('contain', code);
    // ancestors stay visible for context
    rowNamed(world.site.name).should('exist');
    rowNamed(world.subsystem.name).should('exist');
    cy.get(`${ROW}`).should('have.length.lessThan', world.leafCount);

    cy.get(FILTER).clear().type('zzqqxxyy-nothing');
    cy.get('[data-cy="navigation-and-search--empty"]').should('contain', 'No asset matches the filter.');
    cy.get(ROW).should('not.exist');

    cy.get('[data-cy="navigation-and-search--filter-reset"]')
      .should('have.attr', 'title', 'Reset')
      .click();
    cy.get(FILTER).should('have.value', '');
    cy.get('[data-cy="navigation-and-search--filter-reset"]').should('have.attr', 'title', 'Search');
    rowNamed(world.site.name).should('exist');
    cy.get('[data-cy="navigation-and-search--empty"]').should('not.exist');
  });

  it('falls back to a fuzzy match and says so', () => {
    openDrawer();
    // a transposition in the site name ("Cuxhaven" → "Cuxhvaen"): no literal, prefix or
    // subsequence match, only the widened typo pass finds it
    const word = world.site.name.split(' ')[0];
    expect(word.length, 'site name word long enough for a typo').to.be.greaterThan(5);
    const typo = word.slice(0, 4) + word[5] + word[4] + word.slice(6);
    cy.get(FILTER).type(typo);
    cy.get('[data-cy="navigation-and-search--fuzzy-hint"]').should(
      'contain',
      'No exact match — showing similar names.',
    );
    rowNamed(world.site.name).should('exist');
  });

  it('navigates to the asset on row click, marks it current and shows the path header', () => {
    openDrawer();
    cy.get(FILTER).type(world.leaf.name.split(' ')[0]);
    rowNamed(world.leaf.name).click();

    cy.location('hash').should('contain', `/group/${world.leaf.id}`);
    cy.get(DRAWER).should('be.visible');
    rowNamed(world.leaf.name)
      .should('have.attr', 'aria-selected', 'true')
      .find('[data-cy="navigation-and-search--row-current"]')
      .should('contain', 'Current');

    cy.get('[data-cy="navigation-and-search--path"]')
      .should('contain', world.site.name)
      .and('contain', world.subsystem.name)
      .and('contain', world.leaf.name)
      .find('.ps-drawer__path-last')
      .should('contain', world.leaf.name);
  });

  it('opens the detail panel from the info button and opens the asset from there', () => {
    openDrawer();
    cy.get(FILTER).type(world.leaf.name.split(' ')[0]);
    rowNamed(world.leaf.name).find('[data-cy="navigation-and-search--row-info"]').click({ force: true });

    cy.get('[data-cy="navigation-and-search--detail"]').should('be.visible');
    cy.get('[data-cy="navigation-and-search--detail-title"]').should('contain', world.leaf.name);
    cy.get('[data-cy="navigation-and-search--detail-open"]').click();
    cy.location('hash').should('contain', `/group/${world.leaf.id}`);
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
    cy.get('[data-cy="navigation-and-search--collapse-all"]').click();
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
    cy.get('[data-cy="navigation-and-search--detail"]').should('be.visible');
    cy.get(TREE).type('{esc}');
    cy.get('[data-cy="navigation-and-search--detail"]').should('not.exist');
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
    cy.get('[data-cy="navigation-and-search--quick-access-counts"]')
      .invoke('text')
      .should('match', /^\s*0\+\d+\s*$/);
    cy.get(FILTER).type(world.leaf.name.split(' ')[0]);
    rowNamed(world.leaf.name).trigger('mouseenter');

    cy.get('[data-cy="navigation-and-search--detail"]').should('be.visible');
    cy.get('[data-cy="navigation-and-search--detail-title"]').should('contain', world.leaf.name);
    cy.get('[data-cy="navigation-and-search--detail-pin"]').should('contain', 'Pin').click();
    cy.get('[data-cy="navigation-and-search--detail-pin"]').should('contain', 'Unpin');

    rowNamed(world.leaf.name).find('.ps-tree-row__pin').should('exist');
    cy.get('[data-cy="navigation-and-search--quick-access-counts"]')
      .invoke('text')
      .should('match', /^\s*1\+\d+\s*$/);

    // the detail panel's Alarms action routes to the asset's alarm tab
    cy.get('[data-cy="navigation-and-search--detail-alarms"]').click();
    cy.location('hash').should('contain', `/group/${world.leaf.id}/alarms`);
  });

  describe('large tenants (high-volume mode)', () => {
    beforeEach(() => {
      // The size probe decides the mode: report a tenant far beyond what the tree holds at
      // once, so roots load up front and every branch on demand.
      cy.intercept(
        {
          method: 'GET',
          pathname: '/inventory/managedObjects',
          query: { pageSize: '1', withTotalPages: 'true', withChildren: 'false' },
        },
        (req) =>
          req.continue((res) => {
            res.body.statistics = { ...(res.body.statistics ?? {}), totalPages: 1_000_000 };
          })
      ).as('sizeProbe');
      cy.intercept('GET', '**/inventory/managedObjects/*/childAssets*').as('children');
    });

    /** Opens a branch row by clicking its body (not the twisty), unless it is open already. */
    function openByRowClick(name: string) {
      rowNamed(name).then(($row) => {
        if ($row.attr('aria-expanded') !== 'true') {
          cy.wrap($row).find('[data-cy="navigation-and-search--row-name"]').click();
        }
      });
    }

    it('loads the children of a branch opened by clicking its row, below the prefetched levels', () => {
      const nested = `E2E nested ${Date.now()}`;

      // a child asset under a leaf: three levels deep, below the two the startup prefetch loads
      cy.c8yclient((c) => c.inventory.create({ name: nested, type: 'e2e_Nested', c8y_IsAsset: {} })).then(
        (res) => cy.c8yclient((c) => c.inventory.childAssetsAdd(res.body.id, world.leaf.id))
      );
      openDrawer();
      cy.wait('@sizeProbe');

      openByRowClick(world.site.name);
      openByRowClick(world.subsystem.name);
      openByRowClick(world.leaf.name);

      rowNamed(nested).should('exist');
    });

    it('hands a term without match in the loaded branches over to the global search', () => {
      cy.visitApp(`group/${world.site.id}`, { language: 'en', waitFor: NAV_NODE });
      cy.get(NAV_NODE).click();
      cy.get(DRAWER).should('be.visible');
      cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);

      cy.get(FILTER).type('zzqqxxyy');
      cy.get('[data-cy="navigation-and-search--empty"]').should('contain', 'Nothing in the loaded branches matches that.');
      cy.get('[data-cy="navigation-and-search--global-search"]').click();

      cy.get('[data-cy="asset-search--input"]').should('be.visible').and('have.value', 'zzqqxxyy');
    });
  });
});
