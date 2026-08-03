import { IManagedObject } from '@c8y/client';
import { createManagedObject } from './managed-object.factory';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Widget {
  /** x position on the dashboard grid */
  _x?: number;
  /** y position on the dashboard grid */
  _y?: number;
  /** Width in grid columns */
  _width?: number;
  /** Height in grid rows */
  _height?: number;
  /**
   * The component id registered via `HOOK_COMPONENTS` / the widget manifest.
   * This is what Cumulocity uses to look up the Angular component.
   */
  componentId: string;
  /** Random key used to store this widget inside `c8y_Dashboard.children`. */
  id: string;
  /** Widget instance configuration (varies per widget type). */
  config: Record<string, unknown>;
  title?: string;
  classes?: Record<string, boolean>;
}

export interface DashboardJSON {
  c8y_Dashboard: {
    children: Record<string, Pick<Widget, 'config' | 'id' | '_height' | '_width' | '_x' | '_y'>>;
  };
}

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

/**
 * Builds a complete dashboard managed object for a device or group.
 * Optionally pre-populates the `c8y_Dashboard.children` map from `widgets`.
 */
export function mockDashboard(
  groupOrDevice: Partial<IManagedObject>,
  widgets: Widget[] = []
): IManagedObject {
  const isGroup = Cypress._.has(groupOrDevice, 'c8y_IsDeviceGroup');
  const mo = createManagedObject({ name: 'Dashboard' });

  Cypress._.set(
    mo,
    `c8y_Dashboard!${isGroup ? 'group' : 'device'}!${groupOrDevice.id}`,
    {}
  );

  const c8y_Dashboard = {
    classes: { 'dashboard-theme-light': true },
    icon: 'th',
    isFrozen: false,
    name: mo.name,
    priority: 10000,
    children: {} as Record<string, Widget>,
  };

  for (const widget of widgets) {
    Cypress._.set(c8y_Dashboard.children, widget.id, widget);
  }

  Cypress._.set(mo, 'c8y_Dashboard', c8y_Dashboard);
  return mo;
}

/**
 * Builds a widget descriptor with a random `componentId` and `id`.
 * Pass `fragments` to override any default field.
 */
export function mockWidget(fragments?: Partial<Widget>): Widget {
  const base: Widget = {
    componentId: Date.now().toString(36),
    config: {},
    id: `${Math.floor(Math.random() * 1e16)}`,
  };
  return fragments ? { ...base, ...fragments } : base;
}

/**
 * Extracts the array of widget config objects from a dashboard PUT request body.
 * Asserts that `c8y_Dashboard` is present before reading.
 */
export function getWidgetConfigs(putRequestPayload: DashboardJSON): Widget['config'][] {
  expect(Cypress._.has(putRequestPayload, 'c8y_Dashboard')).to.equal(true);
  if (!Cypress._.has(putRequestPayload.c8y_Dashboard, 'children')) {
    return [];
  }
  return Object.keys(putRequestPayload.c8y_Dashboard.children).map((id) =>
    Cypress._.get(putRequestPayload.c8y_Dashboard.children, id)
  );
}
