/// <reference types="cypress" />

/**
 * Asset Navigator — generic counts, availability and the configurable detail panel, on the tenant
 * mock (windy-dev world, but nothing here depends on its types).
 *
 * Covered:
 *  - footer counts devices without the Digital Twin Manager (the mock has none) and assets with it
 *    (DTM stubbed), matching the world
 *  - availability from `c8y_Availability` (set through the mock's REST API): footer stat + row ring
 *  - branch detail rows (Devices / Available x of y / Unavailable / Alarms)
 *  - leaf detail panel shows the default fields
 *  - editing a type's fields via the panel's ⚙ stores `detailPanel` in the user's settings and
 *    survives a reload; reset to default
 *  - "Detail fields…" in the options menu edits a picked type and the default list
 *
 * Names, ids and counts are read from the inventory at runtime — the world is re-pulled in CI.
 */

const NAV_NODE = 'c8y-navigator-node button[data-cy="Tree"]';
const DRAWER = '[data-cy="asset-navigator--drawer"]';
const ROW = '[data-cy="asset-navigator--row"]';
const FILTER = '[data-cy="asset-navigator--filter"]';
const DETAIL = '[data-cy="asset-navigator--detail"]';
const FIELD = '[data-cy="asset-navigator--detail-field"]';
const FIELDCFG = '[data-cy="asset-navigator--fieldcfg"]';
const FOOTER_COUNT = '[data-cy="asset-navigator--footer-count"]';

const DEFAULT_LABELS = ['Status', 'Alarms', 'Type', 'Last updated', 'Model', 'Serial', 'Firmware'];

interface MO {
  id: string;
  name: string;
  type: string;
  c8y_IsAsset?: object;
  c8y_IsDevice?: object;
  childAssets?: { references: { managedObject: { id: string } }[] };
}

interface World {
  site: MO;
  /** A leaf asset (no child assets) with at least one device below it. */
  leaf: MO;
  /** The plain devices below `leaf`. */
  leafDevices: MO[];
  assetCount: number;
  deviceCount: number;
  availableCount: number;
}

/** The root asset, its assets and the devices below them — what the tree sweeps and counts. */
function loadWorld(): Cypress.Chainable<World> {
  return cy.request('/inventory/managedObjects?pageSize=2000&withChildren=true').then((res) => {
    const all = res.body.managedObjects as (MO & { c8y_Availability?: { status?: string } })[];
    const byId = new Map(all.map((mo) => [mo.id, mo]));
    const childrenOf = (mo: MO) =>
      (mo.childAssets?.references ?? [])
        .map((ref) => byId.get(ref.managedObject.id))
        .filter((child): child is MO => !!child);
    const isAsset = (mo: MO) => !!mo.c8y_IsAsset;
    const isPlainDevice = (mo: MO) => !!mo.c8y_IsDevice && !mo.c8y_IsAsset;
    const referenced = new Set(all.flatMap((mo) => childrenOf(mo).map((child) => child.id)));
    const site = all.find((mo) => isAsset(mo) && !referenced.has(mo.id)) as MO;

    const assets: MO[] = [];
    const devices: MO[] = [];
    const walk = (mo: MO) => {
      assets.push(mo);
      for (const child of childrenOf(mo)) {
        if (isAsset(child)) walk(child);
        else if (isPlainDevice(child)) devices.push(child);
      }
    };
    walk(site);

    const leaf = assets.find(
      (mo) => !childrenOf(mo).some(isAsset) && childrenOf(mo).some(isPlainDevice)
    ) as MO;
    const available = devices.filter(
      (mo) =>
        (byId.get(mo.id) as { c8y_Availability?: { status?: string } }).c8y_Availability?.status ===
        'AVAILABLE'
    );

    return {
      site,
      leaf,
      leafDevices: childrenOf(leaf).filter(isPlainDevice),
      assetCount: assets.length,
      deviceCount: devices.length,
      availableCount: available.length,
    };
  });
}

function rowNamed(name: string) {
  return cy.contains(`${ROW} [data-cy="asset-navigator--row-name"]`, name).closest(ROW);
}

function openDrawer() {
  cy.visitShellAndWaitForSelector('', 'en', NAV_NODE);
  cy.get(NAV_NODE).click();
  cy.get(DRAWER).should('be.visible');
  cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);
}

function hover(name: string) {
  cy.get(FILTER).clear().type(name);
  rowNamed(name).trigger('mouseenter');
  cy.get(DETAIL).should('be.visible');
  cy.get('[data-cy="asset-navigator--detail-title"]').should('contain', name);
}

function fieldLabels() {
  return cy
    .get(`${DETAIL} ${FIELD} dt`)
    .then(($dt) => [...$dt].map((dt) => dt.textContent!.trim()));
}

function fieldValue(label: string) {
  return cy.contains(`${DETAIL} ${FIELD} dt`, new RegExp(`^\\s*${label}\\s*$`)).next('dd');
}

/** The stored detail panel, as the last settings write sent it. */
function savedDetailPanel() {
  return cy
    .wait('@saveSettings')
    .its('request.body.customProperties.ps_AssetNavigatorSettings.detailPanel');
}

describe('Asset Navigator — counts, availability and detail fields', () => {
  let world: World;

  beforeEach(() => {
    cy.request('POST', '/_mock/reset');
    cy.getAuth().login().disableGainsight();
    cy.clearLocalStorage();
    // Only the settings writes: the tree also stores recents and the drawer's pin/width on the user.
    cy.intercept('PUT', '**/user/currentUser', (req) => {
      if (
        (req.body as { customProperties?: Record<string, unknown> })?.customProperties?.[
          'ps_AssetNavigatorSettings'
        ] !== undefined
      ) {
        req.alias = 'saveSettings';
      }
    });
    loadWorld().then((w) => (world = w));
  });

  it('counts devices without the Digital Twin Manager', () => {
    openDrawer();
    cy.get(FOOTER_COUNT).should('have.text', `${world.deviceCount} devices`);
    rowNamed(world.site.name)
      .find('[data-cy="asset-navigator--row-count"]')
      .should('have.text', String(world.deviceCount))
      .and('have.attr', 'title', `${world.deviceCount} devices`);
  });

  it('counts assets when the Digital Twin Manager answers', () => {
    cy.intercept('GET', '**/service/dtm/definitions/assets*', { definitions: [] }).as('dtmAssets');
    cy.intercept('GET', '**/service/dtm/definitions/properties*', { definitions: [] });
    openDrawer();
    cy.wait('@dtmAssets');
    cy.get(FOOTER_COUNT).should('have.text', `${world.assetCount} assets`);
    // the badge counts the site's descendants
    rowNamed(world.site.name)
      .find('[data-cy="asset-navigator--row-count"]')
      .should('have.text', String(world.assetCount - 1))
      .and('have.attr', 'title', `${world.assetCount - 1} assets`);
  });

  it('reads availability from c8y_Availability: footer stat, row ring and branch rows', () => {
    const device = world.leafDevices[0];

    cy.request('PUT', `/inventory/managedObjects/${device.id}`, {
      c8y_Availability: { status: 'UNAVAILABLE', lastMessage: '2026-10-01T00:00:00.000Z' },
    });
    const wasAvailable = world.availableCount - (world.leafDevices[0] ? 1 : 0);

    openDrawer();
    cy.get('[data-cy="asset-navigator--footer-unavailable"]')
      .should('contain', '1')
      .and('have.attr', 'title', `1 of ${world.deviceCount} devices are unavailable`);
    cy.get(FILTER).type(world.leaf.name);
    rowNamed(world.leaf.name)
      .find('[data-cy="asset-navigator--row-status"]')
      .should('have.class', 'ps-status-dot--unavailable');

    hover(world.site.name);
    fieldLabels().should('deep.equal', ['Devices', 'Available', 'Unavailable', 'Alarms']);
    fieldValue('Devices').invoke('text').invoke('trim').should('eq', String(world.deviceCount));
    // the controller was available in the world unless it had no status at all
    fieldValue('Available')
      .invoke('text')
      .should(
        'match',
        new RegExp(`^\\s*(${wasAvailable}|${world.availableCount}) of ${world.deviceCount}\\s*$`)
      );
    fieldValue('Unavailable').invoke('text').invoke('trim').should('eq', '1');

    hover(world.leaf.name);
    fieldValue('Status').should('contain', 'Unavailable');
  });

  it('shows the default fields for a leaf asset', () => {
    openDrawer();
    hover(world.leaf.name);
    fieldLabels().should('deep.equal', DEFAULT_LABELS);
    fieldValue('Type').invoke('text').invoke('trim').should('eq', world.leaf.type);
  });

  it("edits a type's fields from the panel's ⚙, stores them in the settings and keeps them after a reload", () => {
    openDrawer();
    hover(world.leaf.name);
    cy.get('[data-cy="asset-navigator--detail-configure"]').click();
    cy.get(FIELDCFG).should('be.visible');
    cy.get('[data-cy="asset-navigator--fieldcfg-inherited"]').should('be.visible');
    cy.get('[data-cy="asset-navigator--fieldcfg-reset"]').should('be.disabled');

    cy.get(
      '[data-cy="asset-navigator--fieldcfg-selected"][data-field-id="property:c8y_Hardware.serialNumber"] input'
    ).click();
    savedDetailPanel().then((panel) => {
      expect(panel.version).to.eq(1);
      expect(
        panel.types[world.leaf.type].map((field: { label: string }) => field.label)
      ).to.deep.eq(DEFAULT_LABELS.filter((label) => label !== 'Serial'));
      expect(panel.default.length).to.eq(DEFAULT_LABELS.length);
    });
    cy.get('[data-cy="asset-navigator--fieldcfg-inherited"]').should('not.exist');
    fieldLabels().should('not.include', 'Serial');

    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);
    hover(world.leaf.name);
    fieldLabels().should(
      'deep.equal',
      DEFAULT_LABELS.filter((label) => label !== 'Serial')
    );

    // back to the default list for this type
    cy.get('[data-cy="asset-navigator--detail-configure"]').click();
    cy.get('[data-cy="asset-navigator--fieldcfg-reset"]').should('be.enabled').click();
    savedDetailPanel().its('types').should('deep.equal', {});
    fieldLabels().should('deep.equal', DEFAULT_LABELS);
  });

  it('edits detail fields from the options menu, for a picked type and for the default list', () => {
    openDrawer();
    cy.get('[data-cy="asset-navigator--settings"]').click();
    cy.get('[data-cy="asset-navigator--setting-detail-fields"]').click();
    cy.get('[data-cy="asset-navigator--detail-fields-modal"]').should('be.visible');
    cy.get('[data-cy="asset-navigator--fieldcfg-scope"]').should(
      'contain',
      'Default for all types'
    );

    // the default list
    cy.get(
      '[data-cy="asset-navigator--fieldcfg-selected"][data-field-id="property:c8y_Firmware.version"] input'
    ).click();
    savedDetailPanel()
      .its('default')
      .should('have.length', DEFAULT_LABELS.length - 1);

    // a type present in the tree
    cy.get('[data-cy="asset-navigator--detail-fields-type"]').select(world.leaf.type);
    cy.get('[data-cy="asset-navigator--fieldcfg-inherited"]').should('be.visible');
    cy.get('[data-cy="asset-navigator--fieldcfg-selected"][data-field-id="type"] input').click();
    savedDetailPanel().then((panel) => {
      const ids = panel.types[world.leaf.type].map(
        (field: { source: { kind: string } }) => field.source.kind
      );
      expect(ids).not.to.include('type');
      // created from the (already edited) default list
      expect(panel.types[world.leaf.type]).to.have.length(DEFAULT_LABELS.length - 2);
    });
    cy.get('[data-cy="asset-navigator--detail-fields-done"]').click();
    cy.get('[data-cy="asset-navigator--detail-fields-modal"]').should('not.exist');

    hover(world.leaf.name);
    fieldLabels().should('deep.equal', ['Status', 'Alarms', 'Last updated', 'Model', 'Serial']);
  });
});
