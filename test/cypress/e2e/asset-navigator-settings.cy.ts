
/**
 * The explorer drawer's options menu (cog next to the pin), on the tenant mock.
 *
 * Settings are stored on the user (`customProperties.ps_AssetNavigatorSettings`) — the mock
 * keeps them for the run, so every test starts from a reset world. SSO users get a managed
 * object of their own instead; the mock cannot log in through an identity provider, so that
 * test marks the current user as an SSO user (`customProperties.userOrigin = OAUTH2`).
 */

const NAV_NODE = 'c8y-navigator-node button[data-cy="Tree"]';
const DRAWER = '[data-cy="asset-navigator--drawer"]';
const ROW = '[data-cy="asset-navigator--row"]';
const FILTER = '[data-cy="asset-navigator--filter"]';
const SETTINGS = '[data-cy="asset-navigator--settings"]';
const MENU = '[data-cy="asset-navigator--settings-menu"]';
const QUICK = '[data-cy="asset-navigator--quick-access"]';
const COUNTS = '[data-cy="asset-navigator--quick-access-counts"]';
const SHORTCUT = '[data-cy="asset-navigator--setting-shortcut"]';
const TRIGGER = 'ps-search-trigger button.main-header-button';
const FACET = '[data-cy="asset-search--facet"]';

const setting = (name: string) => `[data-cy="asset-navigator--setting-${name}"]`;

function openDrawer() {
  cy.visitApp('', { language: 'en', waitFor: NAV_NODE });
  cy.get(NAV_NODE).click();
  cy.get(DRAWER).should('be.visible');
  cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);
}

function openMenu() {
  cy.get(SETTINGS).click();
  cy.get(MENU).should('be.visible');
}

/** The stored settings, as the last user update sent them. */
function savedSettings() {
  return cy
    .wait('@saveUser')
    .its('request.body.customProperties.ps_AssetNavigatorSettings');
}

/** Open the first `n` hierarchy rows' assets, so they become recent entries. */
function visitAssets(n: number) {
  for (let i = 0; i < n; i++) {
    cy.get(ROW).eq(i).find('[data-cy="asset-navigator--row-name"]').click();
    cy.location('hash').should('match', /#\/group\//);
  }
}

describe('Asset Navigator — tree options menu', () => {
  beforeEach(() => {
    cy.request('POST', '/_mock/reset');
    cy.getAuth().login().disableGainsight();
    cy.clearLocalStorage();
    // Only the settings writes: the tree also stores recents and the drawer's pin/width on the user.
    cy.intercept('PUT', '**/user/currentUser', (req) => {
      if ((req.body as { customProperties?: Record<string, unknown> })?.customProperties?.['ps_AssetNavigatorSettings'] !== undefined) {
        req.alias = 'saveUser';
      }
    });
  });

  it('opens next to the pin with the defaults, inventory fallback checked', () => {
    openDrawer();
    cy.get(SETTINGS).should('have.attr', 'title', 'Asset tree options');
    openMenu();
    cy.get(setting('search')).should('be.checked');
    cy.get(setting('quick-access')).should('be.checked');
    cy.get(setting('inventory-fallback')).should('be.checked');
    cy.get(setting('max-pinned')).should('have.value', '10');
    cy.get(setting('max-recent')).should('have.value', '8');
    cy.get(SHORTCUT).should('have.value', 'None');
    cy.get(setting('storage')).should('contain', 'Stored with your user');
  });

  it('hides the search, stores it on the user and keeps it after a reload', () => {
    openDrawer();
    cy.get(FILTER).should('be.visible').type('xyz');
    openMenu();
    cy.get(setting('search')).uncheck({ force: true });
    savedSettings().should('deep.include', { showSearch: false });
    cy.get(FILTER).should('not.exist');
    // hiding the search drops the filter it held: the whole tree is back
    cy.get(ROW).should('have.length.greaterThan', 1);

    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);
    cy.get(FILTER).should('not.exist');
    // typing on the tree no longer filters invisibly
    cy.get(`${DRAWER} [role="tree"][aria-label="Asset hierarchy"]`).focus().type('q');
    cy.get(ROW).should('have.length.greaterThan', 1);
  });

  it('hides and shows "Pinned & Recent"', () => {
    openDrawer();
    cy.get(QUICK).should('be.visible');
    openMenu();
    cy.get(setting('quick-access')).uncheck({ force: true });
    savedSettings().should('deep.include', { showQuickAccess: false });
    cy.get(QUICK).should('not.be.visible');
    cy.get(setting('max-recent')).should('be.disabled');
    cy.get(setting('quick-access')).check({ force: true });
    savedSettings().should('deep.include', { showQuickAccess: true });
    // close the menu first — it overlaps the row it just turned back on
    cy.get(SETTINGS).click();
    cy.get(MENU).should('not.exist');
    cy.get(QUICK).should('be.visible');
  });

  it('limits the recent entries to the configured count', () => {
    openDrawer();
    visitAssets(3);
    cy.get(COUNTS).invoke('text').should('match', /^\s*0\+[2-9]\s*$/);
    openMenu();
    cy.get(setting('max-recent')).clear();
    cy.get(setting('max-recent')).type('1');
    cy.get(setting('max-recent')).blur();
    savedSettings().should('deep.include', { maxRecent: 1 });
    cy.get(COUNTS).invoke('text').should('match', /^\s*0\+1\s*$/);
  });

  it('records a keyboard shortcut that opens and closes the drawer', () => {
    openDrawer();
    openMenu();
    cy.get(SHORTCUT).click();
    cy.get(SHORTCUT).should('have.value', 'Press a key combination…');
    // a bare key is not accepted (it would fire while typing)
    cy.get(SHORTCUT).trigger('keydown', { key: 'x' });
    cy.get(SHORTCUT).should('have.value', 'Press a key combination…');
    cy.get(SHORTCUT).trigger('keydown', { key: 'T', altKey: true, shiftKey: true });
    savedSettings().should('deep.include', { shortcut: 'shift+alt+t' });
    cy.get(SHORTCUT).should('have.value', 'Shift+Alt+T');

    cy.get('[data-cy="asset-navigator--close"]').click({ force: true });
    cy.get(DRAWER).should('not.exist');
    cy.get('body').trigger('keydown', { key: 'T', altKey: true, shiftKey: true });
    cy.get(DRAWER).should('be.visible');
    cy.get('body').trigger('keydown', { key: 'T', altKey: true, shiftKey: true });
    cy.get(DRAWER).should('not.exist');

    // removed again: the chord does nothing
    cy.get(NAV_NODE).click();
    openMenu();
    cy.get(setting('shortcut-clear')).click();
    savedSettings().should('deep.include', { shortcut: '' });
    cy.get(SHORTCUT).should('have.value', 'None');
    cy.get('[data-cy="asset-navigator--close"]').click({ force: true });
    cy.get('body').trigger('keydown', { key: 'T', altKey: true, shiftKey: true });
    cy.get(DRAWER).should('not.exist');
  });

  it('falls back to the inventory for type filters when DTM is unavailable — and not when turned off', () => {
    // The mock has no DTM microservice (404), as a tenant without the subscription.
    openDrawer();
    cy.get('[data-cy="asset-navigator--close"]').click({ force: true });
    cy.get(TRIGGER).click();
    cy.get(FACET).should('have.length.greaterThan', 0).and('contain', 'Wind turbine');

    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    cy.get(DRAWER).should('be.visible');
    openMenu();
    cy.get(setting('inventory-fallback')).uncheck({ force: true });
    savedSettings().should('deep.include', { inventoryFallback: false });

    cy.reload();
    cy.get(TRIGGER, { timeout: 60000 }).click();
    cy.get('[data-cy="asset-search--input"]').should('be.focused');
    cy.get(FACET).should('not.exist');
  });

  it('stores an SSO user\'s settings in a managed object of their own, not on the user', () => {
    // SSO users carry `customProperties.userOrigin = OAUTH2` (the platform's own test); the mock
    // cannot log in through an identity provider, so the current user is marked as one.
    cy.intercept('GET', '**/user/currentUser*', (req) => {
      req.continue((res) => {
        res.body.customProperties = { ...(res.body.customProperties ?? {}), userOrigin: 'OAUTH2' };
      });
    });
    cy.intercept('POST', '**/inventory/managedObjects', (req) => {
      if ((req.body as { type?: string })?.type === 'ps_AssetNavigatorSettings') req.alias = 'createSettings';
    });
    openDrawer();
    openMenu();
    cy.get(setting('storage')).should('contain', 'single sign-on');
    cy.get(setting('search')).uncheck({ force: true });
    cy.wait('@createSettings')
      .its('request.body.ps_AssetNavigatorSettings')
      .should('deep.include', { showSearch: false });
    // nothing of it on the user object
    cy.request('/user/currentUser')
      .its('body')
      .should((user) => expect(user.customProperties?.ps_AssetNavigatorSettings).to.be.undefined);

    cy.request('/inventory/managedObjects?type=ps_AssetNavigatorSettings&pageSize=10')
      .its('body.managedObjects')
      .should('have.length', 1);
    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);
    cy.get(FILTER).should('not.exist');
  });

  it('resets everything to the defaults', () => {
    openDrawer();
    openMenu();
    cy.get(setting('search')).uncheck({ force: true });
    savedSettings();
    cy.get(setting('reset')).click();
    savedSettings().then((saved) => {
      const { detailPanel, ...rest } = saved;

      expect(rest).to.deep.equal({
        showSearch: true,
        shortcut: '',
        showQuickAccess: true,
        maxPinned: 10,
        maxRecent: 8,
        inventoryFallback: true,
      });
      // the detail panel's data contract, at its defaults
      expect(detailPanel.version).to.eq(1);
      expect(detailPanel.types).to.deep.equal({});
      expect(detailPanel.default).to.have.length(7);
    });
    cy.get(FILTER).should('be.visible');
  });
});
