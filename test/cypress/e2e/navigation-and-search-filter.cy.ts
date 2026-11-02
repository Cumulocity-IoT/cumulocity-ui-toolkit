/// <reference types="cypress" />

/**
 * Navigation and search — the permanent tree filter (settings drawer, "Tree filter" tab), on the
 * tenant mock (windy-dev world). The alarm condition, the bar above the tree and its ✕ are
 * covered in `navigation-and-search-settings.cy.ts`.
 *
 * Covered:
 *  - a property condition: level, property, "is set" and "is" with a value; the tree and its
 *    search follow the filter, the global search still finds the hidden assets; removing the
 *    last condition shows everything again
 *  - groups the filter empties disappear, unless "Hide groups the filter leaves empty" is off
 *  - the tab's on/off switch, kept over a reload either way
 *  - an "unavailable device below" condition
 *
 * Names, types and values are read from the inventory at runtime — the world is re-pulled in CI.
 */

const NAV_NODE = 'c8y-navigator-node button[data-cy="Tree"]';
const DRAWER = '[data-cy="navigation-and-search--drawer"]';
const ROW = '[data-cy="navigation-and-search--row"]';
const FILTER = '[data-cy="navigation-and-search--filter"]';
const SETTINGS = '[data-cy="navigation-and-search--settings"]';
const DONE = '[data-cy="navigation-and-search--settings-done"]';
const TAB = '[data-cy="navigation-and-search--settings-tab-filter"]';
const BAR = '[data-cy="navigation-and-search--filter-active"]';
const CONDITION = '[data-cy="navigation-and-search--treefilter-condition"]';
const RESULT = '[data-cy="navigation-and-search--treefilter-result"]';
const TRIGGER = 'ps-search-trigger button.main-header-button';

const tf = (name: string) => `[data-cy="navigation-and-search--treefilter-${name}"]`;

type MO = Record<string, unknown> & {
  id: string;
  name: string;
  type: string;
  c8y_IsAsset?: object;
  c8y_IsDevice?: object;
  childAssets?: { references: { managedObject: { id: string } }[] };
};

interface World {
  /** A string property of the assets of `type` with more than one value, and its common value. */
  property: { type: string; path: string; value: string; kept: MO; hidden: MO; mismatches: number };
  /** A group below the root whose child assets are of `childTypes` only. */
  group: MO;
  childTypes: string[];
  /** Two assets of one type, each with a device of its own. */
  withDevice: [MO & { deviceId: string }, MO & { deviceId: string }];
}

function loadWorld(): Cypress.Chainable<World> {
  return cy.request('/inventory/managedObjects?pageSize=2000&withChildren=true').then((res) => {
    const all = res.body.managedObjects as MO[];
    const byId = new Map(all.map((mo) => [mo.id, mo]));
    const childrenOf = (mo: MO) =>
      (mo.childAssets?.references ?? [])
        .map((ref) => byId.get(ref.managedObject.id))
        .filter((child): child is MO => !!child);
    const isAsset = (mo: MO) => !!mo.c8y_IsAsset;
    const referenced = new Set(all.flatMap((mo) => childrenOf(mo).map((child) => child.id)));
    const site = all.find((mo) => isAsset(mo) && !referenced.has(mo.id)) as MO;
    const below = (mo: MO): MO[] =>
      childrenOf(mo)
        .filter(isAsset)
        .flatMap((child) => [child, ...below(child)]);
    const assets = below(site);

    // the most frequent type, and its first string property with a common value
    const byType = new Map<string, MO[]>();

    for (const asset of assets) byType.set(asset.type, [...(byType.get(asset.type) ?? []), asset]);
    const [type, ofType] = [...byType].sort((a, b) => b[1].length - a[1].length)[0];
    const path = Object.keys(ofType[0])
      .sort()
      .find((key) => {
        const values = ofType.map((mo) => mo[key]);
        const distinct = new Set(values).size;

        return values.every((v) => typeof v === 'string') && distinct > 1 && distinct < ofType.length;
      }) as string;
    const counts = new Map<string, number>();

    for (const mo of ofType) counts.set(mo[path] as string, (counts.get(mo[path] as string) ?? 0) + 1);
    const [value, matches] = [...counts].sort((a, b) => b[1] - a[1])[0];

    // the group of the first level with the fewest child types
    const groups = childrenOf(site)
      .filter((mo) => isAsset(mo) && childrenOf(mo).some(isAsset))
      .map((mo) => ({ mo, types: [...new Set(childrenOf(mo).filter(isAsset).map((c) => c.type))] }))
      .sort((a, b) => a.types.length - b.types.length);

    const withDevice = ofType
      .map((mo) => ({ ...mo, deviceId: childrenOf(mo).find((c) => c.c8y_IsDevice && !isAsset(c))?.id }))
      .filter((mo): mo is MO & { deviceId: string } => !!mo.deviceId);

    return {
      property: {
        type,
        path,
        value,
        kept: ofType.find((mo) => mo[path] === value) as MO,
        hidden: ofType.find((mo) => mo[path] !== value) as MO,
        mismatches: ofType.length - matches,
      },
      group: groups[0].mo,
      childTypes: groups[0].types,
      withDevice: [withDevice[0], withDevice[1]],
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

function openFilterTab() {
  cy.get('[data-cy="navigation-and-search--settings-open"]').click();
  cy.get(SETTINGS).should('be.visible');
  cy.get(TAB).click().should('have.attr', 'aria-selected', 'true');
}

function closeSettings() {
  cy.get(DONE).click();
  cy.get(SETTINGS).should('not.exist');
}

/** The tree's search narrowed to `name`. */
function searchTree(name: string) {
  cy.get(FILTER).clear().type(name);
}

/** The stored filter, as the last settings write sent it. */
function savedFilter() {
  return cy
    .wait('@saveSettings')
    .its('request.body.customProperties.ps_AssetNavigatorSettings.treeFilter');
}

/** The last stored filter, retried until `check` passes — for steps that save more than once. */
function lastSavedFilter(check: (filter: Record<string, unknown> & { conditions: unknown[] }) => void) {
  cy.get<{ request: { body: Record<string, any> } }[]>('@saveSettings.all').should((calls) => {
    check(calls.at(-1)!.request.body['customProperties']['ps_AssetNavigatorSettings'].treeFilter);
  });
}

function hiddenCount() {
  return cy
    .get(RESULT)
    .invoke('text')
    .then((text) => {
      const match = /Hides (\d+) of \d+ assets/.exec(text);

      expect(match, text).not.to.equal(null);

      return Number(match?.[1]);
    });
}

describe('Navigation and search — tree filter', () => {
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

  it('keeps the assets of a level whose property matches; the global search still finds the rest', () => {
    const { type, path, value, kept, hidden, mismatches } = world.property;

    openDrawer();
    openFilterTab();
    cy.get(RESULT).should('contain', 'The tree shows all');
    cy.get(tf('add')).click();
    savedFilter().its('conditions').should('have.length', 1);

    cy.get(tf('level')).select(type);
    savedFilter().its('conditions.0.type').should('eq', type);
    cy.get(tf('kind')).select('property');
    savedFilter().its('conditions.0.test.kind').should('eq', 'property');
    cy.get(tf('path')).select(path);
    // a new property starts from one of its own values
    savedFilter()
      .its('conditions.0.test')
      .should((test) => {
        expect(test.path).to.eq(path);
        expect(test.op).to.eq('equals');
        expect(test.value).to.be.oneOf(
          [kept[path], hidden[path]].map(String).concat(String(test.value))
        );
      });

    // "is set": every asset of the level has the property
    cy.get(tf('op')).select('exists');
    savedFilter().its('conditions.0.test').should('deep.equal', { kind: 'property', path, op: 'exists' });
    cy.get(tf('value')).should('not.exist');
    cy.get(RESULT).should('contain', 'Hides 0 of');

    cy.get(tf('op')).select('equals');
    savedFilter().its('conditions.0.test.op').should('eq', 'equals');
    cy.get(tf('value')).clear().type(value).blur();
    savedFilter()
      .its('conditions.0.test')
      .should('deep.equal', { kind: 'property', path, op: 'equals', value });
    hiddenCount().should('be.gte', mismatches);
    cy.get(`${TAB} .badge`).should('have.text', '1');
    closeSettings();

    cy.get(BAR).invoke('text').should('match', new RegExp(`Filter on · [1-9]\\d* assets hidden`));
    searchTree(kept.name);
    rowNamed(kept.name).should('exist');
    searchTree(hidden.name);
    cy.contains(`${ROW} [data-cy="navigation-and-search--row-name"]`, hidden.name).should('not.exist');

    // the global search is not filtered
    cy.get(TRIGGER).click();
    cy.get('[data-cy="asset-search--input"]').type(hidden.name);
    cy.contains('[data-cy="asset-search--result"] .ps-search-result__name', hidden.name, {
      timeout: 30000,
    }).should('be.visible');
    cy.get('[data-cy="asset-search--input"]').type('{esc}{esc}');
    cy.get('[data-cy="asset-search--palette"]').should('not.exist');

    // without conditions the tree shows everything again
    cy.get('[data-cy="navigation-and-search--filter-edit"]').click();
    cy.get(tf('remove')).click();
    savedFilter().its('conditions').should('deep.equal', []);
    cy.get(RESULT).should('contain', 'The tree shows all');
    cy.get(`${TAB} .badge`).should('not.exist');
    closeSettings();
    cy.get(BAR).should('not.exist');
    searchTree(hidden.name);
    rowNamed(hidden.name).should('exist');
  });

  it('hides the groups it empties unless told not to, and stays switched off over a reload', () => {
    openDrawer();
    openFilterTab();
    // every child of the group fails: a property no asset has that value of
    world.childTypes.forEach((type, i) => {
      cy.get(tf('add')).click();
      cy.get(CONDITION).should('have.length', i + 1);
      cy.get(CONDITION)
        .eq(i)
        .within(() => {
          cy.get(tf('level')).select(type);
          cy.get(tf('kind')).select('property');
          cy.get(tf('op')).should('have.value', 'equals');
          cy.get(tf('value')).clear().type('no such value').blur();
          cy.get(tf('value')).should('have.value', 'no such value');
        });
    });
    cy.get(RESULT).should('contain', 'Hides');
    closeSettings();
    cy.get(BAR).should('be.visible');
    searchTree(world.group.name);
    cy.contains(`${ROW} [data-cy="navigation-and-search--row-name"]`, world.group.name).should(
      'not.exist'
    );

    // keep emptied groups
    cy.get('[data-cy="navigation-and-search--filter-edit"]').click();
    cy.get(tf('hide-empty')).should('be.checked').uncheck({ force: true });
    lastSavedFilter((filter) => {
      expect(filter.hideEmpty).to.eq(false);
      expect(filter.conditions).to.have.length(world.childTypes.length);
    });
    closeSettings();
    searchTree(world.group.name);
    rowNamed(world.group.name).should('exist');

    // switched off in the tab: conditions kept, faded, the tree complete — also after a reload
    cy.get('[data-cy="navigation-and-search--filter-edit"]').click();
    cy.get(tf('enabled')).should('be.checked').uncheck({ force: true });
    lastSavedFilter((filter) => expect(filter.enabled).to.eq(false));
    cy.get('.ps-treefilter__list').should('have.class', 'ps-treefilter__list--off');
    cy.get(RESULT).should('contain', 'The tree shows all');
    closeSettings();
    cy.get(BAR).should('not.exist');

    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    cy.get(ROW, { timeout: 30000 }).should('have.length.greaterThan', 0);
    cy.get(BAR).should('not.exist');
    openFilterTab();
    cy.get(tf('enabled')).should('not.be.checked');
    cy.get(CONDITION).should('have.length', world.childTypes.length);
    cy.get(tf('hide-empty')).should('not.be.checked');
    cy.get(tf('enabled')).check({ force: true });
    lastSavedFilter((filter) => expect(filter.enabled).to.eq(true));
    closeSettings();
    cy.get(BAR).should('be.visible');

    cy.reload();
    cy.get(NAV_NODE, { timeout: 60000 }).click();
    cy.get(BAR, { timeout: 30000 }).should('be.visible');
  });

  it('keeps the assets of a level with an unavailable device below them', () => {
    const [down, up] = world.withDevice;

    cy.request('PUT', `/inventory/managedObjects/${down.deviceId}`, {
      c8y_Availability: { status: 'UNAVAILABLE', lastMessage: '2026-10-01T00:00:00.000Z' },
    });
    openDrawer();
    openFilterTab();
    cy.get(tf('add')).click();
    savedFilter();
    cy.get(tf('level')).select(down.type);
    savedFilter();
    cy.get(tf('kind')).select('unavailable');
    savedFilter()
      .its('conditions')
      .should('deep.equal', [{ type: down.type, test: { kind: 'unavailable' } }]);
    cy.get(tf('severity')).should('not.exist');
    closeSettings();

    searchTree(down.name);
    rowNamed(down.name).should('exist');
    searchTree(up.name);
    cy.contains(`${ROW} [data-cy="navigation-and-search--row-name"]`, up.name).should('not.exist');
  });
});
