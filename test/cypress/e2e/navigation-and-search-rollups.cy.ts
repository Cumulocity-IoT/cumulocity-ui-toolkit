/// <reference types="cypress" />

/**
 * Navigation and search — configurable rollups (settings drawer, "By level" tab), on the tenant
 * mock (windy-dev world).
 *
 * Covered:
 *  - a group level starts with the default rollups; a leaf level has none to configure
 *  - adding a count of one asset type, the duplicate warning, choosing the row badge, removing
 *    and reordering a rollup, resetting the level to the default
 *  - the default set, followed by every group type without a set of its own
 *  - a latest-measurement rollup: the tree's own inventory requests then carry
 *    `withLatestValues=true` (only then, also after a reload), no per-device measurement request,
 *    and the badge shows the average of the latest values
 *
 * Names, types and values are read from the inventory at runtime — the world is re-pulled in CI.
 */

const NAV_NODE = 'c8y-navigator-node button[data-cy="Tree"]';
const DRAWER = '[data-cy="navigation-and-search--drawer"]';
const ROW = '[data-cy="navigation-and-search--row"]';
const FILTER = '[data-cy="navigation-and-search--filter"]';
const DETAIL = '[data-cy="navigation-and-search--detail"]';
const FIELD = '[data-cy="navigation-and-search--detail-field"]';
const SETTINGS = '[data-cy="navigation-and-search--settings"]';
const ROLLUPS = '[data-cy="navigation-and-search--settings-rollups"]';
const ROLLUP = '[data-cy="navigation-and-search--rollupcfg-field"]';
const BADGE = '[data-cy="navigation-and-search--row-count"]';

const cfg = (name: string) => `[data-cy="navigation-and-search--rollupcfg-${name}"]`;

const DEFAULT_IDS = [
  'count:units',
  'availability:available',
  'availability:unavailable',
  'alarms:critical,major,minor,warning',
];

interface MO {
  id: string;
  name: string;
  type: string;
  c8y_IsAsset?: object;
  c8y_IsDevice?: object;
  c8y_LatestMeasurements?: Record<string, Record<string, { value: number }>>;
  childAssets?: { references: { managedObject: { id: string } }[] };
}

interface World {
  site: MO;
  /** An asset below the site without child assets: a leaf level. */
  leaf: MO;
  /** The most frequent asset type below the site, and how many assets have it. */
  commonType: string;
  commonCount: number;
  /** A measurement series (`fragment.series`) of the devices below the site, and its average. */
  series: string;
  seriesAverage: number;
}

function loadWorld(): Cypress.Chainable<World> {
  return cy
    .request('/inventory/managedObjects?pageSize=2000&withChildren=true&withLatestValues=true')
    .then((res) => {
      const all = res.body.managedObjects as MO[];
      const byId = new Map(all.map((mo) => [mo.id, mo]));
      const childrenOf = (mo: MO) =>
        (mo.childAssets?.references ?? [])
          .map((ref) => byId.get(ref.managedObject.id))
          .filter((child): child is MO => !!child);
      const isAsset = (mo: MO) => !!mo.c8y_IsAsset;
      const referenced = new Set(all.flatMap((mo) => childrenOf(mo).map((child) => child.id)));
      const site = all.find((mo) => isAsset(mo) && !referenced.has(mo.id)) as MO;

      const assets: MO[] = [];
      const devices: MO[] = [];
      const walk = (mo: MO) => {
        for (const child of childrenOf(mo)) {
          if (isAsset(child)) {
            assets.push(child);
            walk(child);
          } else if (child.c8y_IsDevice) devices.push(child);
        }
      };
      walk(site);

      const types = new Map<string, number>();

      for (const asset of assets) types.set(asset.type, (types.get(asset.type) ?? 0) + 1);
      const [commonType, commonCount] = [...types].sort((a, b) => b[1] - a[1])[0];

      // the series most devices report
      const values = new Map<string, number[]>();

      for (const device of devices) {
        for (const [fragment, series] of Object.entries(device.c8y_LatestMeasurements ?? {})) {
          for (const [name, latest] of Object.entries(series)) {
            if (typeof latest?.value !== 'number') continue;
            const key = `${fragment}.${name}`;

            values.set(key, [...(values.get(key) ?? []), latest.value]);
          }
        }
      }
      const [series, seriesValues] = [...values].sort((a, b) => b[1].length - a[1].length)[0];

      return {
        site,
        leaf: assets.find((mo) => !childrenOf(mo).some(isAsset)) as MO,
        commonType,
        commonCount,
        series,
        seriesAverage: seriesValues.reduce((sum, value) => sum + value, 0) / seriesValues.length,
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

function levelChip(type: string) {
  return cy.get(`[data-cy="navigation-and-search--settings-level"][data-type="${type}"]`);
}

/** The settings drawer, "By level" tab, on the entry of `type` (`null`: the default). */
function openLevel(type: string | null) {
  cy.get('[data-cy="navigation-and-search--settings-open"]').click();
  cy.get(SETTINGS).should('be.visible');
  cy.get('[data-cy="navigation-and-search--settings-tab-levels"]').click();

  if (type === null) {
    cy.get('[data-cy="navigation-and-search--settings-level-default"]')
      .click()
      .should('have.attr', 'aria-selected', 'true');
  } else {
    levelChip(type).click();
    levelChip(type).should('have.attr', 'aria-selected', 'true');
  }
}

function closeSettings() {
  cy.get('[data-cy="navigation-and-search--settings-done"]').click();
  cy.get(SETTINGS).should('not.exist');
}

function rollupIds() {
  return cy
    .get(ROLLUP)
    .then(($li) => [...$li].map((li) => li.getAttribute('data-rollup-id')));
}

/** The stored rollups, as the last settings write sent them. */
function savedRollups() {
  return cy
    .wait('@saveSettings')
    .its('request.body.customProperties.ps_AssetNavigatorSettings.rollups');
}

describe('Navigation and search — rollups', () => {
  let world: World;
  /** Inventory requests of the run, and the measurement requests (there must be none). */
  let latestRequests: string[];
  let measurementRequests: string[];

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
    latestRequests = [];
    measurementRequests = [];
    cy.intercept('GET', '**/inventory/managedObjects*', (req) => {
      if (req.query['withLatestValues'] === 'true') {
        latestRequests.push(req.url);
        req.alias = 'latestSweep';
      }
    });
    cy.intercept('GET', '**/measurement/measurements*', (req) => {
      measurementRequests.push(req.url);
    });
    loadWorld().then((w) => (world = w));
  });

  it('offers rollups for group levels only, starting from the defaults', () => {
    openDrawer();
    openLevel(world.site.type);
    cy.get(ROLLUPS).should('be.visible');
    cy.get(cfg('inherited')).should('be.visible');
    cy.get(cfg('reset')).should('be.disabled');
    rollupIds().should('deep.equal', DEFAULT_IDS);
    cy.get(cfg('badge')).should('have.value', 'count:units');
    // the sample's values next to the labels
    cy.get(`${ROLLUP}[data-rollup-id="count:units"] .ps-rollupcfg__value`)
      .invoke('text')
      .should('match', /^\d+$/);

    levelChip(world.leaf.type).click();
    cy.get(ROLLUPS).should('not.exist');
    cy.get('[data-cy="navigation-and-search--fieldcfg"]').should('be.visible');
  });

  it('counts assets of one type as the badge, then removes, reorders and resets the level', () => {
    const id = `count:assets:${world.commonType}`;

    openDrawer();
    openLevel(world.site.type);

    cy.get(cfg('new')).click();
    cy.get(cfg('add')).should('be.enabled');
    cy.get(cfg('what')).select('count-assets');
    cy.get(cfg('type')).select(world.commonType);
    cy.get(cfg('label')).type('Of the common type');
    cy.get(cfg('add')).click();
    savedRollups()
      .its(`types.${world.site.type}`)
      .should((set) => {
        expect(set.fields).to.have.length(DEFAULT_IDS.length + 1);
        expect(set.fields.at(-1)).to.deep.equal({
          label: 'Of the common type',
          metric: { kind: 'count', of: 'assets', type: world.commonType },
        });
        // the first edit copied the default badge
        expect(set.badge).to.eq('count:units');
      });
    cy.get(cfg('form')).should('not.exist');
    cy.get(cfg('inherited')).should('not.exist');
    cy.get(cfg('reset')).should('be.enabled');
    cy.get(`${ROLLUP}[data-rollup-id="${id}"] .ps-rollupcfg__value`).should(
      'have.text',
      String(world.commonCount)
    );

    // the same rollup a second time is refused
    cy.get(cfg('new')).click();
    cy.get(cfg('what')).select('count-assets');
    cy.get(cfg('type')).select(world.commonType);
    cy.get(cfg('duplicate')).should('be.visible');
    cy.get(cfg('add')).should('be.disabled');
    cy.get(cfg('cancel')).click();
    cy.get(cfg('form')).should('not.exist');

    cy.get(cfg('badge')).select(id);
    savedRollups().its(`types.${world.site.type}.badge`).should('eq', id);
    cy.get(`${ROLLUP}[data-rollup-id="${id}"]`).should('contain', 'Badge');

    cy.get(`${ROLLUP}[data-rollup-id="availability:unavailable"] ${cfg('remove')}`).click();
    savedRollups()
      .its(`types.${world.site.type}.fields`)
      .should('have.length', DEFAULT_IDS.length);
    rollupIds().should('not.include', 'availability:unavailable');

    // drag the first rollup below the second, as a mouse does it: CDK takes mouse events with a
    // pressed button only, and starts dragging after a few pixels
    cy.get(ROLLUP).then(($items) => {
      const handle = $items[0].querySelector('.ps-rollupcfg__grip') as HTMLElement;
      const grip = handle.getBoundingClientRect();
      const target = $items[1].getBoundingClientRect();
      const x = grip.left + 4;
      const mouse = (clientY: number) => ({
        eventConstructor: 'MouseEvent',
        button: 0,
        buttons: 1,
        detail: 1,
        clientX: x,
        clientY,
        force: true,
      });

      cy.wrap(handle).trigger('mousedown', mouse(grip.top + 4));
      for (const y of [grip.top + 10, grip.top + 16, target.top + 10, target.bottom - 2]) {
        cy.document().trigger('mousemove', mouse(y));
      }
      cy.document().trigger('mouseup', mouse(target.bottom - 2));
    });
    savedRollups()
      .its(`types.${world.site.type}.fields`)
      .then((fields: { metric: { kind: string } }[]) => fields.map((field) => field.metric.kind))
      .should('deep.equal', ['availability', 'count', 'alarms', 'count']);

    closeSettings();
    rowNamed(world.site.name)
      .find(BADGE)
      .should('have.text', String(world.commonCount))
      .and('have.attr', 'title', `Of the common type: ${world.commonCount}`);
    cy.get(FILTER).type(world.site.name);
    rowNamed(world.site.name).trigger('mouseenter');
    cy.get(`${DETAIL} ${FIELD} dt`)
      .then(($dt) => [...$dt].map((dt) => dt.textContent?.trim()))
      .should('deep.equal', ['Available', 'Devices', 'Alarms', 'Of the common type']);

    // back to the default rollups
    cy.get('[data-cy="navigation-and-search--filter-reset"]').click();
    openLevel(world.site.type);
    cy.get(cfg('reset')).click();
    savedRollups().its('types').should('deep.equal', {});
    cy.get(cfg('inherited')).should('be.visible');
    rollupIds().should('deep.equal', DEFAULT_IDS);
    closeSettings();
    rowNamed(world.site.name).find(BADGE).invoke('attr', 'title').should('match', /^Devices: \d+$/);
  });

  it('edits the default rollups, which group types without a set of their own follow', () => {
    openDrawer();
    openLevel(null);
    cy.get(ROLLUPS).should('be.visible');
    // the default set is the one being edited, so it is never "inherited"
    cy.get(cfg('inherited')).should('not.exist');

    cy.get(cfg('new')).click();
    cy.get(cfg('what')).select('alarmed-assets');
    cy.get(cfg('severity-major')).uncheck({ force: true });
    cy.get(cfg('label')).should('have.attr', 'placeholder', 'Assets with alarms');
    cy.get(cfg('add')).click();
    savedRollups()
      .its('default.fields')
      .then((fields) => fields.at(-1))
      .should('deep.equal', {
        label: '',
        metric: { kind: 'alarmed', of: 'assets', severities: ['critical'] },
      });

    cy.get(cfg('badge')).select('alarmed:assets:critical');
    savedRollups().should((rollups) => {
      expect(rollups.default.badge).to.eq('alarmed:assets:critical');
      expect(rollups.types).to.deep.equal({});
    });
    closeSettings();

    // the site has no set of its own: its badge follows the default
    rowNamed(world.site.name)
      .find(BADGE)
      .invoke('attr', 'title')
      .should('match', /^Assets with alarms: \d+$/);
  });

  it('rolls up the latest measurements from the tree’s own requests, without per-device requests', () => {
    const [fragment, name] = world.series.split('.');

    openDrawer();
    // no measurement rollup yet: the tree does not ask for latest values
    cy.then(() => expect(latestRequests).to.have.length(0));

    openLevel(world.site.type);
    cy.get(cfg('new')).click();
    cy.get(cfg('what')).select('measurement');
    cy.get(cfg('add')).should('be.disabled');
    cy.get(cfg('series')).type(world.series);
    cy.get(cfg('fn')).select('avg');
    cy.get(cfg('label')).type('Latest');
    cy.get(cfg('unit')).type('u');
    cy.get(cfg('add')).click();
    savedRollups()
      .its(`types.${world.site.type}.fields`)
      .then((fields) => fields.at(-1))
      .should('deep.equal', {
        label: 'Latest',
        metric: { kind: 'measurement', series: world.series, fn: 'avg' },
        unit: 'u',
      });
    // the first measurement rollup sweeps again, now with the latest values
    cy.wait('@latestSweep');

    const id = `measurement:avg:${world.series}`;
    const expected = `${world.seriesAverage.toLocaleString(undefined, { maximumFractionDigits: 1 })} u`;

    cy.get(`${ROLLUP}[data-rollup-id="${id}"] .ps-rollupcfg__value`).should('have.text', expected);
    // now offered as a series of the tree
    cy.get(cfg('new')).click();
    cy.get(cfg('what')).select('measurement');
    cy.get(`#psRollupSeriesList option[value="${fragment}.${name}"]`).should('exist');
    cy.get(cfg('cancel')).click();

    cy.get(cfg('badge')).select(id);
    savedRollups();
    closeSettings();
    rowNamed(world.site.name)
      .find(BADGE)
      .should('have.text', expected)
      .and('have.attr', 'title', `Latest: ${expected}`);

    // stored: the first sweep after a reload asks for the latest values right away
    cy.then(() => (latestRequests.length = 0));
    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    rowNamed(world.site.name).find(BADGE, { timeout: 30000 }).should('have.text', expected);
    cy.then(() => {
      expect(latestRequests).to.have.length.greaterThan(0);
      expect(measurementRequests, 'measurement requests').to.have.length(0);
    });

    // without a measurement rollup the next load does not ask for them any more
    openLevel(world.site.type);
    cy.get(`${ROLLUP}[data-rollup-id="${id}"] ${cfg('remove')}`).click();
    savedRollups();
    closeSettings();
    cy.then(() => (latestRequests.length = 0));
    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);
    // the badge went with the rollup
    rowNamed(world.site.name).find(BADGE).should('not.exist');
    cy.then(() => expect(latestRequests).to.have.length(0));
  });
});
