/// <reference types="cypress" />

/**
 * Navigation and search — generic counts, availability and the configurable detail panel, on the tenant
 * mock (windy-dev world, but nothing here depends on its types).
 *
 * Covered:
 *  - footer counts devices without the Digital Twin Manager (the mock has none) and assets with it
 *    (DTM stubbed), matching the world
 *  - availability from `c8y_Availability` (set through the mock's REST API): footer stat + row ring
 *  - branch detail rows (Devices / Available x of y / Unavailable / Alarms)
 *  - leaf detail panel shows the default fields
 *  - the settings drawer's "Detail fields by level" tab: one entry per type of the tree, a live
 *    preview; editing a type's fields stores `detailPanel` in the user's settings and survives a
 *    reload; reset to default; the default list
 *
 * Names, ids and counts are read from the inventory at runtime — the world is re-pulled in CI.
 */

const NAV_NODE = 'c8y-navigator-node button[data-cy="Tree"]';
const DRAWER = '[data-cy="navigation-and-search--drawer"]';
const ROW = '[data-cy="navigation-and-search--row"]';
const FILTER = '[data-cy="navigation-and-search--filter"]';
const DETAIL = '[data-cy="navigation-and-search--detail"]';
const FIELD = '[data-cy="navigation-and-search--detail-field"]';
const FIELDCFG = '[data-cy="navigation-and-search--fieldcfg"]';
const PREVIEW = '[data-cy="navigation-and-search--settings-preview"]';
const SETTINGS = '[data-cy="navigation-and-search--settings"]';
const FOOTER_COUNT = '[data-cy="navigation-and-search--footer-count"]';

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
  return cy.contains(`${ROW} [data-cy="navigation-and-search--row-name"]`, name).closest(ROW);
}

function openDrawer() {
  cy.visitApp('', { language: 'en', waitFor: NAV_NODE });
  cy.get(NAV_NODE).click();
  cy.get(DRAWER).should('be.visible');
  cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);
}

function hover(name: string) {
  cy.get(FILTER).clear().type(name);
  rowNamed(name).trigger('mouseenter');
  cy.get(DETAIL).should('be.visible');
  cy.get('[data-cy="navigation-and-search--detail-title"]').should('contain', name);
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

/** The settings drawer, "Detail fields by level" tab, on the entry of `type`. */
function openLevel(type: string) {
  cy.get('[data-cy="navigation-and-search--settings-open"]').click();
  cy.get(SETTINGS).should('be.visible');
  cy.get('[data-cy="navigation-and-search--settings-tab-levels"]').click();
  levelChip(type).click();
  levelChip(type).should('have.attr', 'aria-selected', 'true');
}

function levelChip(type: string) {
  return cy.get(`[data-cy="navigation-and-search--settings-level"][data-type="${type}"]`);
}

function closeSettings() {
  cy.get('[data-cy="navigation-and-search--settings-done"]').click();
  cy.get(SETTINGS).should('not.exist');
}

function previewLabels() {
  return cy
    .get(`${PREVIEW} ${FIELD} dt`)
    .then(($dt) => [...$dt].map((dt) => dt.textContent?.trim() ?? ''));
}

describe('Navigation and search — counts, availability and detail fields', () => {
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
      .find('[data-cy="navigation-and-search--row-count"]')
      .should('have.text', String(world.deviceCount))
      .and('have.attr', 'title', `Devices: ${world.deviceCount}`);
  });

  it('counts assets when the Digital Twin Manager answers', () => {
    cy.intercept('GET', '**/service/dtm/definitions/assets*', { definitions: [] }).as('dtmAssets');
    cy.intercept('GET', '**/service/dtm/definitions/properties*', { definitions: [] });
    openDrawer();
    cy.wait('@dtmAssets');
    cy.get(FOOTER_COUNT).should('have.text', `${world.assetCount} assets`);
    // the badge counts the site's descendants
    rowNamed(world.site.name)
      .find('[data-cy="navigation-and-search--row-count"]')
      .should('have.text', String(world.assetCount - 1))
      .and('have.attr', 'title', `Assets: ${world.assetCount - 1}`);
  });

  it('reads availability from c8y_Availability: footer stat, row ring and branch rows', () => {
    const device = world.leafDevices[0];

    cy.request('PUT', `/inventory/managedObjects/${device.id}`, {
      c8y_Availability: { status: 'UNAVAILABLE', lastMessage: '2026-10-01T00:00:00.000Z' },
    });
    const wasAvailable = world.availableCount - (world.leafDevices[0] ? 1 : 0);

    openDrawer();
    cy.get('[data-cy="navigation-and-search--footer-unavailable"]')
      .should('contain', '1')
      .and('have.attr', 'title', `1 of ${world.deviceCount} devices are unavailable`);
    cy.get(FILTER).type(world.leaf.name);
    rowNamed(world.leaf.name)
      .find('[data-cy="navigation-and-search--row-status"]')
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

  it("edits a level's fields in the settings drawer, stores them and keeps them after a reload", () => {
    openDrawer();
    hover(world.leaf.name);
    // the hover panel no longer configures itself
    cy.get(`${DETAIL} [data-cy="navigation-and-search--detail-configure"]`).should('not.exist');
    cy.get(`${DETAIL} [data-cy="navigation-and-search--detail-open"]`).should('be.visible');

    openLevel(world.leaf.type);
    cy.get(FIELDCFG).should('be.visible');
    cy.get('[data-cy="navigation-and-search--fieldcfg-inherited"]').should('be.visible');
    cy.get('[data-cy="navigation-and-search--fieldcfg-reset"]').should('be.disabled');
    // the preview: an asset of this type, fields only, no actions
    previewLabels().should('deep.equal', DEFAULT_LABELS);
    cy.get(`${PREVIEW} [data-cy="navigation-and-search--detail-open"]`).should('not.exist');

    cy.get(
      '[data-cy="navigation-and-search--fieldcfg-selected"][data-field-id="property:c8y_Hardware.serialNumber"] input'
    ).click();
    savedDetailPanel().then((panel) => {
      expect(panel.version).to.eq(1);
      expect(
        panel.types[world.leaf.type].map((field: { label: string }) => field.label)
      ).to.deep.eq(DEFAULT_LABELS.filter((label) => label !== 'Serial'));
      expect(panel.default.length).to.eq(DEFAULT_LABELS.length);
    });
    cy.get('[data-cy="navigation-and-search--fieldcfg-inherited"]').should('not.exist');
    levelChip(world.leaf.type).should('contain', 'Custom');
    previewLabels().should('not.include', 'Serial');
    closeSettings();
    hover(world.leaf.name);
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
    openLevel(world.leaf.type);
    cy.get('[data-cy="navigation-and-search--fieldcfg-reset"]').should('be.enabled').click();
    savedDetailPanel().its('types').should('deep.equal', {});
    previewLabels().should('deep.equal', DEFAULT_LABELS);
    closeSettings();
    hover(world.leaf.name);
    fieldLabels().should('deep.equal', DEFAULT_LABELS);
  });

  it("adds a property of the type's assets from the platform's asset property list", () => {
    openDrawer();
    openLevel(world.leaf.type);
    cy.intercept('GET', '**/inventory/managedObjects/*').as('getAsset');
    cy.get('[data-cy="navigation-and-search--fieldcfg-add-properties"]').click();
    cy.wait('@getAsset');

    // the asset's own fragments are listed (the mock has no DTM model for them), keys shown
    const picker = '[data-cy="navigation-and-search--property-picker"]';
    const add = '[data-cy="navigation-and-search--property-picker-add"]';

    cy.get(add).should('be.disabled');
    cy.contains(`${picker} [role="treeitem"]`, /^\s*owner\s+owner\s/)
      .find('input[type="checkbox"]')
      .check({ force: true });
    cy.get(add).should('contain', '(1)').click();
    cy.get(picker).should('not.exist');

    savedDetailPanel().then((panel) => {
      const fields = panel.types[world.leaf.type] as { label: string; source: { path?: string } }[];

      expect(fields).to.have.length(DEFAULT_LABELS.length + 1);
      expect(fields.at(-1)).to.deep.equal({ label: 'Owner', source: { kind: 'property', path: 'owner' } });
    });
    previewLabels().should('include', 'Owner');
  });

  it("rolls up a number property for a group level and shows it as the group's badge", () => {
    openDrawer();
    openLevel(world.site.type);
    cy.get('[data-cy="navigation-and-search--settings-rollups"]').should('be.visible');
    // the defaults: what a group showed before rollups were configurable
    cy.get('[data-cy="navigation-and-search--rollupcfg-field"]')
      .then(($li) => [...$li].map((li) => li.getAttribute('data-rollup-id')))
      .should('deep.equal', [
        'count:units',
        'availability:available',
        'availability:unavailable',
        'alarms:critical,major,minor,warning',
      ]);

    cy.get('[data-cy="navigation-and-search--rollupcfg-new"]').click();
    cy.get('[data-cy="navigation-and-search--rollupcfg-what"]').select('property');
    // whichever number property the world's assets carry first
    cy.get('[data-cy="navigation-and-search--rollupcfg-path"] option')
      .eq(1)
      .invoke('val')
      .then((path) => {
        cy.get('[data-cy="navigation-and-search--rollupcfg-path"]').select(String(path));
        cy.get('[data-cy="navigation-and-search--rollupcfg-label"]').type('Rolled up');
        cy.get('[data-cy="navigation-and-search--rollupcfg-add"]').click();
        cy.wait('@saveSettings')
          .its('request.body.customProperties.ps_AssetNavigatorSettings.rollups')
          .then((rollups) => {
            const fields = rollups.types[world.site.type].fields;

            expect(fields).to.have.length(5);
            expect(fields[4]).to.deep.equal({
              label: 'Rolled up',
              metric: { kind: 'property', path, fn: 'sum' },
            });
          });

        cy.get('[data-cy="navigation-and-search--rollupcfg-badge"]').select(`property:sum:${path}`);
        cy.wait('@saveSettings')
          .its('request.body.customProperties.ps_AssetNavigatorSettings.rollups')
          .its(`types.${world.site.type}.badge`)
          .should('eq', `property:sum:${path}`);
      });
    previewLabels().should('include', 'Rolled up');
    closeSettings();
    rowNamed(world.site.name)
      .find('[data-cy="navigation-and-search--row-count"]')
      .invoke('attr', 'title')
      .should('match', /^Rolled up: /);
  });

  it('lists the tree’s types by level and edits the default list', () => {
    openDrawer();
    openLevel(world.site.type);
    // the root's type is on the first level, the leaf's further down
    cy.get('[data-cy="navigation-and-search--settings-levels"] .ps-settings__row')
      .first()
      .find(`[data-type="${world.site.type}"]`)
      .should('have.attr', 'aria-selected', 'true');
    levelChip(world.leaf.type).should('exist');

    // the default list
    cy.get('[data-cy="navigation-and-search--settings-level-default"]').click();
    cy.get('[data-cy="navigation-and-search--fieldcfg-scope"]').should(
      'contain',
      'Default for all types'
    );
    cy.get(
      '[data-cy="navigation-and-search--fieldcfg-selected"][data-field-id="property:c8y_Firmware.version"] input'
    ).click();
    savedDetailPanel()
      .its('default')
      .should('have.length', DEFAULT_LABELS.length - 1);

    // a type of the tree: its own list starts from the (edited) default
    levelChip(world.leaf.type).click();
    cy.get('[data-cy="navigation-and-search--fieldcfg-inherited"]').should('be.visible');
    cy.get('[data-cy="navigation-and-search--fieldcfg-selected"][data-field-id="type"] input').click();
    savedDetailPanel().then((panel) => {
      const ids = panel.types[world.leaf.type].map(
        (field: { source: { kind: string } }) => field.source.kind
      );
      expect(ids).not.to.include('type');
      expect(panel.types[world.leaf.type]).to.have.length(DEFAULT_LABELS.length - 2);
    });
    closeSettings();

    hover(world.leaf.name);
    fieldLabels().should('deep.equal', ['Status', 'Alarms', 'Last updated', 'Model', 'Serial']);
  });
});
