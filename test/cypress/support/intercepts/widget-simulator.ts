/**
 * Widget Simulator
 * ============================================================
 * Helpers that simulate a fully-configured Cumulocity dashboard
 * without touching a real backend.
 *
 * ## The problem these solve
 *
 * Adding a widget to a real dashboard via the Cumulocity UI is slow,
 * flaky, and couples unrelated tests together.  These helpers instead:
 *
 *   1. Build an in-memory dashboard + widget config with factory functions
 *   2. Register cy.intercept() stubs so the shell loads that mocked state
 *   3. Navigate to the device/group page — the widget appears already configured
 *
 * ## Two test modes
 *
 * ### View / edit an existing widget (most chart + config tests)
 * ```ts
 * const device = { name: 'Test device', id: mockId() };
 * const widget = mockWidget({ componentId: 'threshold.widget', config, ...DIMENSIONS });
 *
 * beforeEach(() => {
 *   stubDeviceDashboard(device, this.deviceFixture, [widget]);
 *   cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', 'w2a-threshold-widget');
 * });
 * ```
 *
 * ### Add a new widget from scratch (empty dashboard)
 * ```ts
 * const device = { name: 'Test device', id: mockId() };
 *
 * beforeEach(() => {
 *   stubDeviceDashboard(device, this.deviceFixture, []); // empty
 *   cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', DashboardSelectors.WIDGET_EDIT_READY);
 *   enterEditMode();
 *   C8yWidgetModal.selectWidget('Threshold Configuration');
 * });
 * ```
 *
 * ### Assert widget config was saved correctly
 * ```ts
 * const dashboard = stubDeviceDashboard(device, this.deviceFixture, []);
 * const saveAlias = interceptDashboardSave(dashboard.id);
 * cy.get('[data-cy="c8y-widgets-dashboard--save"]').click({ force: true });
 * assertWidgetConfigSaved(saveAlias, expectedConfig, ['history']);
 * ```
 */

import { IManagedObject } from '@c8y/client';
// Matches Cypress.C8yLanguage from cumulocity-cypress
type C8yLanguage = 'de' | 'en';
import { Widget, mockDashboard } from '../factories/dashboard.factory';
import { mockListResponse } from '../factories/list-response.factory';
import { mockInventoryObject, mockInventoryGroup } from './inventory.intercepts';
import {
  DashboardSelectors,
  WidgetChildSelectors,
  WidgetMenuSelectors,
} from '../selectors/dashboard.selectors';
import { C8yWidgetModal } from '../page-objects';

// ---------------------------------------------------------------------------
// Core stub helpers — register intercepts, return the dashboard synchronously
// ---------------------------------------------------------------------------

/**
 * Stubs all inventory GET variants for `device` and the dashboard query so
 * `widgets` are pre-loaded when the shell navigates to `device/${device.id}`.
 *
 * Returns the dashboard managed object so its `id` can be used in subsequent
 * `interceptDashboardSave()` calls.
 *
 * @param device       Identifies the device — only `id` is required
 * @param deviceData   Full managed object content to return for inventory GETs
 * @param widgets      Widgets to include in the dashboard (pass `[]` for empty)
 */
export function stubDeviceDashboard(
  device: Partial<IManagedObject>,
  deviceData: Partial<IManagedObject>,
  widgets: Widget[] = []
): IManagedObject {
  const dashboard = mockDashboard(device, widgets);
  mockInventoryObject(device.id!, deviceData);
  cy.intercept(
    'GET',
    `inventory/managedObjects?*c8y_Dashboard!device!${device.id!}*`,
    { ...mockListResponse([dashboard]) }
  );
  return dashboard;
}

/**
 * Stubs all inventory GET variants for `group` (and its `children`) and the
 * group-dashboard query so `widgets` are pre-loaded when the shell navigates
 * to `group/${group.id}`.
 *
 * @param group    Identifies the group — only `id` is required
 * @param children Child managed objects to return from child-asset queries
 * @param widgets  Widgets to include in the dashboard (pass `[]` for empty)
 */
export function stubGroupDashboard(
  group: Partial<IManagedObject>,
  children: IManagedObject[] = [],
  widgets: Widget[] = []
): IManagedObject {
  const dashboard = mockDashboard(group, widgets);
  mockInventoryGroup(group, children);
  cy.intercept(
    'GET',
    `inventory/managedObjects?*c8y_Dashboard!group!${group.id}*`,
    { ...mockListResponse([dashboard]) }
  );
  cy.intercept(
    'GET',
    `inventory/managedObjects/${dashboard.id}`,
    { ...dashboard }
  );
  return dashboard;
}

// ---------------------------------------------------------------------------
// Combined stub + navigate helpers
// ---------------------------------------------------------------------------

/**
 * Stubs the device + dashboard and immediately navigates to the device page,
 * waiting for `waitForSelector` to become visible.
 *
 * Use for tests that verify **widget display** or want to **edit an existing
 * widget configuration** (pre-configured via `widgets`).
 *
 * @example
 * const widget = mockWidget({ componentId: 'threshold.widget', config, ...DIMENSIONS });
 * visitDeviceWithWidget(device, this.fixtureData, [widget], 'w2a-threshold-widget');
 */
export function visitDeviceWithWidget(
  device: Partial<IManagedObject>,
  deviceData: Partial<IManagedObject>,
  widgets: Widget[],
  waitForSelector: string,
  language: C8yLanguage = 'en'
): IManagedObject {
  const dashboard = stubDeviceDashboard(device, deviceData, widgets);
  cy.visitShellAndWaitForSelector(`device/${device.id}`, language, waitForSelector);
  return dashboard;
}

/**
 * Stubs the device + empty dashboard and navigates to the device page,
 * waiting for the **"Add widget" button** to appear (edit-mode entry point).
 *
 * Use for tests that verify **widget creation / configuration from scratch**.
 *
 * After calling this, enter edit mode and open the widget picker:
 * ```ts
 * enterEditMode();
 * C8yWidgetModal.selectWidget('My Widget');
 * ```
 */
export function visitDeviceWithEmptyDashboard(
  device: Partial<IManagedObject>,
  deviceData: Partial<IManagedObject>,
  language: C8yLanguage = 'en'
): IManagedObject {
  return visitDeviceWithWidget(device, deviceData, [], DashboardSelectors.WIDGET_EDIT_READY, language);
}

/**
 * Stubs the group + dashboard and immediately navigates to the group page,
 * waiting for `waitForSelector` to become visible.
 *
 * @example
 * const widget = mockWidget({ componentId: 'event.list.widget', config, ...DIMENSIONS });
 * visitGroupWithWidget(group, [device], [widget], 'w2a-event-list-widget');
 */
export function visitGroupWithWidget(
  group: Partial<IManagedObject>,
  children: IManagedObject[],
  widgets: Widget[],
  waitForSelector: string,
  language: C8yLanguage = 'en'
): Cypress.Chainable<IManagedObject> {
  const dashboard = stubGroupDashboard(group, children, widgets);
  cy.visitShellAndWaitForSelector(`group/${group.id}`, language, waitForSelector);
  return cy.wrap(dashboard);
}

/**
 * Stubs the group + empty dashboard and navigates, waiting for the
 * "Add widget" button.
 */
export function visitGroupWithEmptyDashboard(
  group: Partial<IManagedObject>,
  children: IManagedObject[] = [],
  language: C8yLanguage = 'en'
): Cypress.Chainable<IManagedObject> {
  return visitGroupWithWidget(group, children, [], DashboardSelectors.WIDGET_EDIT_READY, language);
}

// ---------------------------------------------------------------------------
// Dashboard edit-mode interaction helpers
// ---------------------------------------------------------------------------

/**
 * Clicks the "Edit widgets" toolbar button to enter dashboard edit mode.
 * This must be called before `openWidgetForEditing()`, `openAddWidgetModal()`,
 * or any `c8y-dashboard-child` actions.
 */
export function enterEditMode(): void {
  cy.get(DashboardSelectors.EDIT_WIDGETS).click({ force: true });
}

/**
 * Opens the edit drawer for the **first widget** on the dashboard.
 *
 * Clicks: Edit widgets → widget gear icon → "Edit widget" menu item.
 *
 * Call `enterEditMode()` first, or use the combined `openWidgetForEditing()`.
 */
export function clickEditWidgetMenuItem(): void {
  cy.get(WidgetChildSelectors.SETTINGS).first().click({ force: true });
  cy.get(WidgetMenuSelectors.EDIT).click({ force: true });
}

/**
 * Enters edit mode AND opens the widget configuration drawer for the
 * first widget on the dashboard.
 *
 * Equivalent to clicking: Edit widgets → gear icon → "Edit widget".
 */
export function openWidgetForEditing(): void {
  enterEditMode();
  clickEditWidgetMenuItem();
  C8yWidgetModal.waitForConfigToLoad();
}

/**
 * Saves the widget configuration and then saves the dashboard layout.
 *
 * Equivalent to: widget-config Save → dashboard Save.
 */
export function saveWidgetAndDashboard(): void {
  cy.get('c8y-widget-config button[title="Save"]').click();
  cy.get(DashboardSelectors.SAVE).click({ force: true });
}

// ---------------------------------------------------------------------------
// Dashboard save intercept + assertion helpers
// ---------------------------------------------------------------------------

/**
 * Stubs the `PUT inventory/managedObjects/{dashboardId}` request and returns
 * the Cypress alias string (`@<alias>`).
 *
 * The intercepted request resolves with `{ statusCode: 200 }` by default.
 * Use `cy.wait(saveAlias)` to assert the request body afterwards.
 *
 * @example
 * const saveAlias = interceptDashboardSave(dashboard.id);
 * cy.get('[data-cy="c8y-widgets-dashboard--save"]').click({ force: true });
 * cy.wait(saveAlias).its('request.body.c8y_Dashboard.children').should(...);
 */
export function interceptDashboardSave(dashboardId: string, alias = 'saveDashboard'): string {
  cy.intercept('PUT', `inventory/managedObjects/${dashboardId}`, { statusCode: 200 }).as(alias);
  return `@${alias}`;
}

/**
 * Stubs the `PUT inventory/managedObjects/{dashboardId}` request so the
 * `dashboardRef` object is kept in sync with the saved body on every save.
 *
 * Useful in tests that save multiple times and need the latest dashboard state.
 *
 * @example
 * let dashboard = stubDeviceDashboard(device, fixture, [widget]);
 * interceptDashboardSaveUpdating(dashboard.id, (body) => { dashboard = { ...dashboard, ...body }; });
 */
export function interceptDashboardSaveUpdating(
  dashboardId: string,
  onSave: (savedBody: IManagedObject) => void,
  alias = 'saveDashboard'
): string {
  cy.intercept('PUT', `inventory/managedObjects/${dashboardId}`, (req) => {
    onSave(req.body);
    req.reply({ status: 200 });
  }).as(alias);
  return `@${alias}`;
}

/**
 * Waits for a captured dashboard save and asserts the widget config inside
 * `c8y_Dashboard.children`.
 *
 * Handles the `children` map structure — picks the first widget key and
 * extracts its `.config` field for the assertion.
 *
 * @param saveAlias    Alias returned by `interceptDashboardSave()`, e.g. `'@saveDashboard'`
 * @param expected     The expected widget config object
 * @param omitFields   Top-level fields to omit from the actual config before comparing
 *                     (e.g. `['history']` to ignore history metadata)
 *
 * @example
 * assertWidgetConfigSaved('@saveDashboard', expectedConfig, ['history']);
 */
export function assertWidgetConfigSaved(
  saveAlias: string,
  expected: Record<string, unknown>,
  omitFields: string[] = []
): void {
  cy.wait(saveAlias)
    .its('request.body.c8y_Dashboard.children')
    .should(($children) => {
      const widgetKey = Object.keys($children)[0];
      const actual: Record<string, unknown> = Cypress._.get($children, `${widgetKey}.config`);
      const compared = omitFields.length ? Cypress._.omit(actual, omitFields) : actual;
      expect(compared).to.deep.equal(expected);
    });
}

/**
 * Extracts all widget configs from a captured dashboard save as a Cypress
 * chainable. Useful when the dashboard has multiple widgets and you need to
 * assert more than one.
 *
 * @example
 * getWidgetConfigsFromSave('@saveDashboard').should('have.length', 2);
 */
export function getWidgetConfigsFromSave(saveAlias: string): Cypress.Chainable<unknown[]> {
  return cy.wait(saveAlias).its('request.body.c8y_Dashboard.children').then(($children) =>
    Object.keys($children).map((key) => Cypress._.get($children, `${key}.config`))
  ) as unknown as Cypress.Chainable<unknown[]>;
}
