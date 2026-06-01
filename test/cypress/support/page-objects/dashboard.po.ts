import { recurse } from 'cypress-recurse';
import { IManagedObject } from '@c8y/client';
import {
  WidgetChildSelectors,
  WidgetConfigSelectors,
  WidgetMenuSelectors,
  DashboardSelectors,
} from '../selectors/dashboard.selectors';

/**
 * Page-object for the Cumulocity dashboard shell.
 *
 * ⚠️  `createDashboardForDevice` and `createDashboardForGroup` suppress the
 * ResizeObserver error that fires when the Angular portal renders into the
 * dashboard grid. A global handler is registered in `e2e.ts`; these methods
 * simply navigate and wait for the Save button.
 */
export class C8yDashboard {
  private static buildDashboardPayload(
    target: Partial<IManagedObject>,
    kind: 'device' | 'group'
  ): Record<string, unknown> {
    const targetId = String(target.id ?? '');
    const targetDashboardKey =
      kind === 'group' ? `c8y_Dashboard!group!${targetId}` : `c8y_Dashboard!device!${targetId}`;

    const payload: Record<string, unknown> = {
      name: `Cypress Dashboard ${targetId}`,
      c8y_Dashboard: {
        children: {},
        name: `Cypress Dashboard ${targetId}`,
        icon: 'th',
        priority: 10000,
        columns: 24,
      },
      [targetDashboardKey]: {},
    };

    const cyTestId = (target as Record<string, unknown>)['cy_testId'];
    if (typeof cyTestId === 'string' && cyTestId.length > 0) {
      payload['cy_testId'] = cyTestId;
    }

    return payload;
  }

  private static createDashboardForTarget(
    target: Partial<IManagedObject>,
    kind: 'device' | 'group'
  ): void {
    const payload = this.buildDashboardPayload(target, kind);
    cy.c8yclient((c) => c.inventory.create(payload));
  }

  /**
   * Navigates to the new-dashboard page for a device and saves it.
   * Relies on the global `Cypress.on('uncaught:exception')` ResizeObserver
   * handler that is registered in `cypress/support/e2e.ts`.
   */
  static createDashboardForDevice(device: Partial<IManagedObject>): void {
    this.createDashboardForTarget(device, 'device');
    cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', DashboardSelectors.EDIT_WIDGETS);
  }

  /**
   * Navigates to the new-dashboard page for a group and saves it.
   */
  static createDashboardForGroup(group: Partial<IManagedObject>): void {
    this.createDashboardForTarget(group, 'group');
    cy.visitShellAndWaitForSelector(`group/${group.id}`, 'en', DashboardSelectors.EDIT_WIDGETS);
  }

  /**
   * Clicks dashboard Save when the control is rendered in the current shell variant.
   */
  static saveLayoutIfVisible(): void {
    cy.get('body').then(($body) => {
      const $saveButton = $body.find(`${DashboardSelectors.SAVE}:visible`).first();
      if ($saveButton.length > 0) {
        cy.wrap($saveButton).click({ force: true });
      }
    });
  }
}

/**
 * Page-object for the "Add widget" dialog (`<c8y-widget-config>`).
 */
export class C8yAddWidgetDialog {
  private static escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  static ensureEditMode(): void {
    cy.get('body').then(($body) => {
      if ($body.find(`${DashboardSelectors.ADD_WIDGET}:visible`).length === 0) {
        cy.get(DashboardSelectors.EDIT_WIDGETS).should('be.visible').click({ force: true });
      }
    });
  }

  static openAddWidgetModal(): void {
    this.ensureEditMode();
    cy.get(DashboardSelectors.ADD_WIDGET_ANY, { timeout: 60_000 })
      .filter(':visible')
      .first()
      .should('be.enabled')
      .click({ force: true });
    cy.get(WidgetConfigSelectors.SEARCH).should('be.visible').should('have.focus');
  }

  /**
   * Opens the "Add widget" toolbar button and selects the named widget.
   *
   * Uses `cypress-recurse` to handle a timing issue where registered plugins
   * are not yet reflected in the widget list on first open. When the widget is
   * not found the modal is closed (CANCEL), the test waits 4 s to let the
   * shell finish loading plugins, then reopens and retries — up to 3 times.
   */
  static openAndSelect(widgetName: string): void {
    const widgetMatcher = new RegExp(this.escapeRegExp(widgetName), 'i');

    recurse(
      // ── Command: open the modal and type the search term.
      // Must not throw — we return `cy.get('body')` so the predicate can
      // inspect the DOM without Cypress failing on a missing element.
      () => {
        this.openAddWidgetModal();
        cy.get(WidgetConfigSelectors.SEARCH).clear().type(widgetName);
        return cy.get('body');
      },
      // ── Predicate: is the widget visible in the list right now?
      ($body: JQuery<HTMLBodyElement>) =>
        $body
          .find(`${WidgetConfigSelectors.WIDGET_LIST}:visible`)
          .filter((_, el) => widgetMatcher.test((el.textContent ?? '').trim()))
          .length > 0,
      {
        limit: 4,          // 1 initial attempt + 3 retries
        delay: 0,          // timing is handled in `post`, not by recurse's own delay
        timeout: 90_000,   // generous ceiling: 4 attempts × ~10 s + 3 × 4 s waits
        postLastValue: true,
        post: ({ success }: { success: boolean }) => {
          if (!success) {
            cy.log(
              `Widget "${widgetName}" not found in the list — plugins may still be loading. ` +
              `Closing modal and retrying in 4 s.`
            );
            cy.get(WidgetConfigSelectors.CANCEL).click({ force: true });
            cy.wait(4_000);
          }
        },
        error: `Widget "${widgetName}" was not found in the widget list after 4 attempts. Plugins may have failed to load.`,
      }
    ).then(() => {
      // Widget is confirmed visible — now click it.
      cy.contains(`${WidgetConfigSelectors.WIDGET_LIST}:visible`, widgetMatcher)
        .scrollIntoView()
        .click({ force: true });
    });
  }

  /** Selects the first radio device in the asset-selector miller column. */
  static selectAnyDevice(): void {
    cy.get('body').then(($body) => {
      const $configRoot = $body.find('c8y-widget-config:visible').first();
      const $scope = $configRoot.length ? $configRoot : $body;
      const visibleRadios =
        'c8y-asset-selector-miller input[type="radio"]:visible, c8y-asset-selector input[type="radio"]:visible';
      if ($scope.find(visibleRadios).length > 0) {
        cy.get(visibleRadios).first().click({ force: true });
        return;
      }

      const visibleMillerButtons = 'c8y-asset-selector-miller button.miller-column__item__btn:visible';
      if ($scope.find(visibleMillerButtons).length > 0) {
        cy.get(visibleMillerButtons).first().click({ force: true });
        return;
      }

      const visibleNavigatorButtons = 'c8y-widget-config c8y-navigator-node button.btn-clean:visible';
      if ($scope.find(visibleNavigatorButtons).length > 0) {
        cy.get(visibleNavigatorButtons).first().click({ force: true });
        return;
      }

      const anySelectable =
        'c8y-widget-config c8y-navigator-node button.btn-clean, c8y-asset-selector input[type="radio"], c8y-asset-selector-node, c8y-asset-selector-miller button.miller-column__item__btn';
      if ($scope.find(anySelectable).length > 0) {
        cy.get(anySelectable).first().click({ force: true });
      }
    });
  }

  /** Selects a specific device/asset entry by visible name in the selector tree. */
  static selectDevice(deviceName: string): void {
    cy.get('body').then(($body) => {
      const $configRoot = $body.find('c8y-widget-config:visible').first();
      const $scope = $configRoot.length ? $configRoot : $body;
      const anyEntries = $scope.find(
        'c8y-navigator-node button.btn-clean, c8y-asset-selector-miller button.miller-column__item__btn, c8y-asset-selector-node'
      );

      const matchingVisible = anyEntries.filter((_, el) => {
        const text = (el.textContent ?? '').trim();
        const title = (el.getAttribute('title') ?? '').trim();
        return (
          Cypress.$(el).is(':visible') &&
          (text.includes(deviceName) || title.includes(deviceName))
        );
      });

      if (matchingVisible.length > 0) {
        cy.wrap(matchingVisible.first()).click({ force: true });
        return;
      }

      const matchingAny = anyEntries.filter((_, el) => {
        const text = (el.textContent ?? '').trim();
        const title = (el.getAttribute('title') ?? '').trim();
        return text.includes(deviceName) || title.includes(deviceName);
      });

      if (matchingAny.length > 0) {
        cy.wrap(matchingAny.first()).click({ force: true });
        return;
      }

      this.selectAnyDevice();
    });
  }

  /** Clicks the Save button in the widget config modal and waits for it to close. */
  static saveAndClose(): void {
    cy.get(WidgetConfigSelectors.SAVE).click({ force: true });
    // TODO: Replace with cy.wait('@<alias>') once the relevant PUT intercept is aliased in the test.
    cy.wait(1000);
  }
}

/**
 * Page-object for the widget selection modal that appears when adding a
 * widget to a dashboard.
 */
export class C8yWidgetModal {
  private static readonly WIDGET_NAME_ALIASES: Record<string, string> = {
    'Device Properties': 'Advanced Asset Properties',
    'Device Property Table': 'Asset Property Table',
    'Device Status': 'Asset Status',
  };

  private static resolveWidgetName(widgetName: string): string {
    return this.WIDGET_NAME_ALIASES[widgetName] ?? widgetName;
  }

  /**
   * Opens the "Add widget" button, searches for `widgetName`, then clicks it.
   */
  static selectWidget(widgetName: string): void {
    C8yAddWidgetDialog.openAndSelect(this.resolveWidgetName(widgetName));
  }

  static waitForConfigToLoad(): void {
    cy.get('c8y-widget-config-section', { timeout: 20_000 }).should('be.visible');
  }

  /**
   * Opens the widget picker, selects the widget, then selects the first available device.
   */
  static selectWidgetAndAnyDevice(widgetName: string): void {
    this.selectWidget(widgetName);
    C8yAddWidgetDialog.selectAnyDevice();
  }

  /**
   * Navigates to a dashboard context route and opens the widget selector.
   *
   * Supports both device and group contexts, e.g. `device/<id>` or `group/<id>`.
   * Optionally selects the first available device in the add-widget dialog.
   */
  static openOnContext(
    contextPath: string,
    widgetName: string,
    options: {
      readySelector?: string;
      waitTime?: number;
      selectAnyDevice?: boolean;
    } = {}
  ): void {
    const readySelector = options.readySelector ?? DashboardSelectors.WIDGET_EDIT_READY;
    const waitTime = options.waitTime ?? 3000;

    cy.visitShellAndWaitForSelector(contextPath, 'en', readySelector);

    if (options.selectAnyDevice) {
      this.selectWidgetAndAnyDevice(widgetName);
      return;
    }

    this.selectWidget(widgetName);
  }
}
