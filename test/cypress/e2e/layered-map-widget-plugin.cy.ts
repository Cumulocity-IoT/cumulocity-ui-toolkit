/// <reference types="cypress" />

import { IManagedObject } from '@c8y/client';
import { AddWidgetDialog, DashboardSelectors, WidgetConfigModal, enterEditMode, openWidgetForEditing } from '@cumulocity-iot/ui-sdk/cypress';

/**
 * Layered Map widget (`iot.cumulocity.layered.map.widget`)
 *
 * Widget: leaflet map, a base tile layer + one overlay per configured query layer
 * (Inventory / Alarm / Event query → markers at the devices' `c8y_Position`), a layer
 * control to toggle overlays, marker popups (device link, last update, alarms, latest
 * values), auto-center / manual center.
 *
 * Config: map provider (built-in + custom base layers stored in inventory), auto-center
 * vs manual center (lat/lng/zoom + picker modal), position polling, layers list
 * (add / edit / delete / popover settings).
 *
 * Data is created via API on the tenant mock (devices with `c8y_Position`, alarms,
 * events, dashboards). External map tiles are stubbed.
 */
const WIDGET_ID = 'iot.cumulocity.layered.map.widget';
const DEVICE_TYPE = 'lm_e2e_tracker';
const ALARM_TYPE = 'lm_e2e_alarm';
const EVENT_TYPE = 'lm_e2e_event';
const WIDGET = 'layered-map-widget';
const MARKER = `${WIDGET} .leaflet-marker-pane .c8y-map-marker-icon`;
const TRANSPARENT_PNG =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';


type Layer = {
  config: Record<string, unknown>;
  active: boolean;
};

const devices: IManagedObject[] = [];
let host: IManagedObject;

function layer(name: string, type: 'Inventory' | 'Alarm' | 'Event', filter: Record<string, unknown>, extra = {}): Layer {
  return {
    active: true,
    config: {
      name,
      icon: 'globe',
      color: '#ff0000',
      enablePolling: false,
      pollingInterval: 60,
      type,
      filter,
      popoverConfig: { showAlarms: true, showDate: true, showLatestValues: true, assetProperties: [], actions: [] },
      ...extra,
    },
  };
}

function inventoryLayer(name = 'Trackers', extra = {}): Layer {
  return layer(name, 'Inventory', { type: DEVICE_TYPE }, extra);
}

function widgetConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    layers: [inventoryLayer()],
    baseTileLayerId: 'osm',
    autoCenter: true,
    manualCenter: { lat: 0, long: 0, zoomLevel: 15 },
    positionPolling: { enabled: false, interval: 10 },
    saved: true,
    // the shell's widget config requires an asset selection before it can be saved
    device: { id: host.id, name: host.name },
    ...overrides,
  };
}

/** Creates a device dashboard holding one layered map widget (or none) and returns its id. */
function createDashboard(config?: Record<string, unknown>): Cypress.Chainable<string> {
  const children: Record<string, unknown> = {};
  if (config) {
    children['lmwidget'] = {
      id: 'lmwidget',
      name: WIDGET_ID,
      componentId: WIDGET_ID,
      title: 'Layered Map',
      config,
      _x: 0,
      _y: 0,
      _width: 24,
      _height: 8,
    };
  }
  return cy
    .getAuth()
    .c8yclient((c) =>
      c.inventory.create({
        name: 'Layered map dashboard',
        [`c8y_Dashboard!device!${host.id}`]: {},
        c8y_Dashboard: { name: 'Layered map', icon: 'th', priority: 10000, columns: 24, children },
      })
    )
    .then((res) => (res.body as IManagedObject).id);
}

function visitDashboard(dashboardId: string, waitFor = `${WIDGET} .leaflet-container`): void {
  cy.visitApp(`device/${host.id}/dashboard/${dashboardId}`, { language: 'en', waitFor });
}

function readWidgetConfig(dashboardId: string): Cypress.Chainable<Record<string, unknown>> {
  return cy
    .getAuth()
    .c8yclient((c) => c.inventory.detail(dashboardId))
    .then((res) => {
      const children = (res.body as IManagedObject)['c8y_Dashboard'].children as Record<string, { config: Record<string, unknown> }>;
      return Object.values(children)[0].config;
    });
}

function stubTiles(): void {
  const png = Cypress.Buffer.from(TRANSPARENT_PNG, 'base64');
  const reply = { statusCode: 200, headers: { 'content-type': 'image/png' }, body: png };
  cy.intercept({ hostname: /tile\.openstreetmap\.org$/ }, reply).as('osmTiles');
  cy.intercept({ hostname: /(arcgisonline\.com|cartocdn\.com|opentopomap\.org)$/ }, reply);
  cy.intercept({ hostname: 'tiles.e2e.example' }, reply).as('customTiles');
}

function layerItem(name: string): Cypress.Chainable<JQuery<HTMLElement>> {
  return cy.get(`[data-cy="layered-map-config--layer"][data-layer-name="${name}"]`);
}

function layerAction(name: string, action: 'edit' | 'popover' | 'delete'): void {
  layerItem(name).find('.dropdown-toggle').first().click();
  cy.get(`[data-cy="layered-map-config--layer-${action}"]:visible`).first().click();
}

function saveWidgetConfig(): void {
  cy.get('[data-cy="widget-config--save-widget"], c8y-widget-config button[title="Save"]').filter(':visible').first().click();
}

describe('Layered Map Widget', () => {
  before(() => {
    cy.getAuth().login();
    const positions = [
      { lat: 51.2277, lng: 6.7735 },
      { lat: 51.2377, lng: 6.7835 },
      { lat: 51.2477, lng: 6.7935 },
    ];
    positions.forEach((pos, i) => {
      cy.createDevice({
        name: `LM tracker ${i + 1}`,
        type: DEVICE_TYPE,
        c8y_Position: pos,
        ...(i === 0
          ? {
              c8y_ActiveAlarmsStatus: { critical: 1 },
              c8y_LatestMeasurements: { c8y_Temperature: { T: { value: 21.5, unit: 'C', time: new Date().toISOString() } } },
            }
          : {}),
      }).then((d) => devices.push(d));
    });
    // a device of the same type without position must not produce a marker
    cy.createDevice({ name: 'LM tracker no position', type: DEVICE_TYPE });
    cy.createDevice({ name: 'LM host' }).then((d) => (host = d));

    cy.then(() => {
      cy.getAuth().c8yclient((c) =>
        c.alarm.create({
          source: { id: devices[0].id },
          type: ALARM_TYPE,
          text: 'LM e2e alarm',
          severity: 'CRITICAL',
          time: new Date().toISOString(),
        } as never)
      );
      cy.getAuth().c8yclient((c) =>
        c.event.create({ source: { id: devices[1].id }, type: EVENT_TYPE, text: 'LM e2e event', time: new Date().toISOString() })
      );
    });
  });

  beforeEach(() => {
    cy.getAuth().login().disableGainsight();
    stubTiles();
  });

  describe('widget', () => {
    it('renders the map with the base tile layer and one marker per positioned device', () => {
      createDashboard(widgetConfig()).then(visitDashboard);
      cy.wait('@osmTiles');
      cy.get(MARKER).should('have.length', 3);
      // layer color/icon are applied to the marker
      cy.get(MARKER).first().find('.dlt-c8y-icon-marker').should('have.attr', 'style').and('contain', '#ff0000');
      cy.get(MARKER).first().find('i.dlt-c8y-icon-globe').should('exist');
    });

    it('shows the overlays in the layer control and toggles them', () => {
      createDashboard(
        widgetConfig({ layers: [inventoryLayer('Trackers'), { ...inventoryLayer('Hidden layer', { icon: 'star' }), active: false }] })
      ).then(visitDashboard);
      cy.get(MARKER).should('have.length', 3);

      cy.get(`${WIDGET} .leaflet-control-layers-overlays label`).should('have.length', 2).as('overlays');
      cy.get('@overlays').eq(0).should('contain.text', 'Trackers').find('input').should('be.checked');
      cy.get('@overlays').eq(1).should('contain.text', 'Hidden layer').find('input').should('not.be.checked');
      cy.get(`${WIDGET} .leaflet-control-layers-base label`).should('contain.text', 'OpenStreetMap');

      // switching the active layer off removes its markers
      // native click on the (collapsed) control: cy.click() emits mouseover first, which runs
      // leaflet's expand guard (`_preventClick`) and swallows the click
      cy.get('@overlays').eq(0).find('input').then(($input) => $input[0].click());
      cy.get('@overlays').eq(0).find('input').should('not.be.checked');
      cy.get(MARKER).should('not.exist');

      // the inactive layer is loaded when switched on
      // native click on the (collapsed) control: cy.click() emits mouseover first, which runs
      // leaflet's expand guard (`_preventClick`) and swallows the click
      cy.get('@overlays').eq(1).find('input').then(($input) => $input[0].click());
      cy.get(`${MARKER} i.dlt-c8y-icon-star`).should('have.length', 3);
    });

    it('opens a popup with device link, last update, alarms and latest values', () => {
      createDashboard(widgetConfig()).then(visitDashboard);
      cy.get(MARKER).should('have.length', 3);
      cy.then(() => {
        cy.get(MARKER).eq(0).click({ force: true });
      });
      cy.get('[data-cy="layered-map-popup--link"]').should('be.visible').invoke('text').should('match', /LM tracker \d/);
      cy.get('[data-cy="layered-map-popup--link"]')
        .invoke('attr', 'href')
        .should('match', /^#\/device\/\d+$/);
      cy.get('[data-cy="layered-map-popup--date"]').should('contain.text', 'Last update');
      cy.get('[data-cy="layered-map-popup--alarms"]').should('exist');
    });

    it('shows alarm status and latest values in the popup of a device that has them', () => {
      createDashboard(widgetConfig({ layers: [layer('Alarms', 'Alarm', { type: ALARM_TYPE }, { popoverConfig: { showAlarms: true, showDate: false, showLatestValues: true, assetProperties: [], actions: [] } })] })).then(
        visitDashboard
      );
      // only the alarm source gets a marker, flagged with the alarm severity
      cy.get(MARKER).should('have.length', 1);
      cy.get(MARKER).find('.status.critical').should('exist');
      cy.get(MARKER).click({ force: true });
      cy.get('[data-cy="layered-map-popup--link"]').should('contain.text', 'LM tracker 1');
      cy.get('[data-cy="layered-map-popup--alarms"] .status.critical').should('contain.text', '1');
      cy.get('[data-cy="layered-map-popup--latest-values"]').should('contain.text', 'T').and('contain.text', '21.5');
      cy.get('[data-cy="layered-map-popup--date"]').should('not.exist');
    });

    it('renders an event query layer at the event sources', () => {
      createDashboard(widgetConfig({ layers: [layer('Events', 'Event', { type: EVENT_TYPE })] })).then(visitDashboard);
      cy.get(MARKER).should('have.length', 1);
      cy.get(MARKER).click({ force: true });
      cy.get('[data-cy="layered-map-popup--link"]').should('contain.text', 'LM tracker 2');
    });

    it('renders an empty map when a layer query matches nothing', () => {
      createDashboard(widgetConfig({ layers: [inventoryLayer('Nothing', { filter: { type: 'lm_does_not_exist' } })] })).then(
        visitDashboard
      );
      cy.wait('@osmTiles');
      cy.get(`${WIDGET} .leaflet-control-layers`).should('exist');
      cy.get(MARKER).should('not.exist');
    });

    it('centers the map manually when auto-center is off', () => {
      createDashboard(
        widgetConfig({ autoCenter: false, manualCenter: { lat: 48.1, long: 11.5, zoomLevel: 7 } })
      ).then(visitDashboard);
      // tile URLs carry the zoom level: {z}/{x}/{y}
      cy.wait('@osmTiles').its('request.url').should('match', /\/7\/\d+\/\d+\.png/);
    });

    it('uses a custom base tile layer stored in inventory', () => {
      cy.getAuth().c8yclient((c) =>
        c.inventory.create({
          type: 'ps_layeredMapBaseLayerConfig',
          name: 'Layered Map Base Layer Configuration',
          ps_layeredMapBaseLayers: {
            layers: [{ id: 'custom-1', label: 'E2E tiles', url: 'https://tiles.e2e.example/{z}/{x}/{y}.png' }],
          },
        })
      ).then((res) => {
        const id = (res.body as IManagedObject).id;
        createDashboard(widgetConfig({ baseTileLayerId: 'custom-1' })).then(visitDashboard);
        cy.wait('@customTiles');
        cy.get(`${WIDGET} .leaflet-control-layers-base label`).should('contain.text', 'E2E tiles');
        cy.getAuth().c8yclient((c) => c.inventory.delete(id));
      });
    });
  });

  describe('configuration', () => {
    it('can be added from the widget picker with sensible defaults', () => {
      createDashboard().then((id) => visitDashboard(id, DashboardSelectors.WIDGET_EDIT_READY));
      enterEditMode();
      AddWidgetDialog.openAndSelect('Layered Map');
      WidgetConfigModal.waitForConfig();

      cy.get('[data-cy="layered-map-config--base-layer"]').should('have.value', 'osm');
      cy.get('[data-cy="layered-map-config--auto-center"] option:selected').should('contain.text', 'Fit all markers');
      cy.get('[data-cy="layered-map-config--center-lat"]').should('be.disabled');
      cy.get('[data-cy="layered-map-config--position-polling"] option:selected').should('contain.text', 'No automatic polling');
      cy.get('[data-cy="layered-map-config--position-polling-interval"]').should('be.disabled');
      cy.get('[data-cy="layered-map-config--layer"]').should('not.exist');
    });

    it('adds an inventory query layer and saves it', () => {
      createDashboard(widgetConfig({ layers: [] })).then((dashboardId) => {
        visitDashboard(dashboardId);
        openWidgetForEditing();

        cy.get('[data-cy="layered-map-config--add-layer"]').click();
        cy.get('[data-cy="layered-map-layer--type"]').select('QueryLayerConfig');
        cy.get('[data-cy="layered-map-layer--name"]').type('New trackers');
        cy.get('[data-cy="layered-map-layer--icon"]').type('truck');
        cy.get('c8y-modal ps-query-forms-tab').should('exist');
        cy.get('[data-cy="layered-map-layer--polling"]').select('No automatic polling');
        cy.get('c8y-modal [data-cy="c8y-modal--ok"], c8y-modal button.btn-primary').filter(':visible').last().should('contain.text', 'Create').click();

        layerItem('New trackers').should('be.visible').and('contain.text', 'No polling');
        saveWidgetConfig();
        cy.get(DashboardSelectors.SAVE).click({ force: true });

        readWidgetConfig(dashboardId).should((cfg) => {
          const layers = cfg['layers'] as Layer[];
          expect(layers).to.have.length(1);
          expect(layers[0].active).to.eq(true);
          expect(layers[0].config).to.include({ name: 'New trackers', icon: 'truck', type: 'Inventory', enablePolling: false });
          expect(cfg['saved']).to.eq(true);
        });
      });
    });

    it('requires a layer type and name before a layer can be created', () => {
      createDashboard(widgetConfig({ layers: [] })).then(visitDashboard);
      openWidgetForEditing();
      cy.get('[data-cy="layered-map-config--add-layer"]').click();
      cy.get('c8y-modal button.btn-primary').filter(':visible').last().as('ok').should('be.disabled');
      cy.get('[data-cy="layered-map-layer--type"]').select('QueryLayerConfig');
      cy.get('@ok').should('be.disabled');
      cy.get('[data-cy="layered-map-layer--name"]').type('x');
      cy.get('@ok').should('be.enabled');
      cy.get('c8y-modal button.btn-default').filter(':visible').contains('Cancel').click();
      cy.get('[data-cy="layered-map-config--layer"]').should('not.exist');
    });

    it('edits and deletes layers', () => {
      createDashboard(widgetConfig({ layers: [inventoryLayer('First'), inventoryLayer('Second')] })).then((dashboardId) => {
        visitDashboard(dashboardId);
        openWidgetForEditing();
        cy.get('[data-cy="layered-map-config--layer"]').should('have.length', 2);

        layerAction('First', 'edit');
        cy.get('[data-cy="layered-map-layer--name"]').should('have.value', 'First').clear().type('Renamed');
        cy.get('[data-cy="layered-map-layer--polling"]').select('Activate polling');
        cy.get('c8y-modal button.btn-primary').filter(':visible').last().should('contain.text', 'Update').click();
        layerItem('Renamed').should('contain.text', '60s');

        layerAction('Second', 'delete');
        cy.get('[data-cy="layered-map-config--layer"]').should('have.length', 1);

        saveWidgetConfig();
        cy.get(DashboardSelectors.SAVE).click({ force: true });
        readWidgetConfig(dashboardId).should((cfg) => {
          const layers = cfg['layers'] as Layer[];
          expect(layers.map((l) => l.config['name'])).to.deep.eq(['Renamed']);
          expect(layers[0].config['enablePolling']).to.eq(true);
        });
      });
    });

    it('edits the popover settings of a layer', () => {
      createDashboard(widgetConfig()).then((dashboardId) => {
        visitDashboard(dashboardId);
        openWidgetForEditing();
        layerAction('Trackers', 'popover');
        cy.get('c8y-modal formly-form input[type="checkbox"]').should('have.length.at.least', 3);
        cy.get('c8y-modal formly-form input[type="checkbox"]').first().uncheck({ force: true });
        cy.get('c8y-modal button.btn-primary').filter(':visible').last().click();

        saveWidgetConfig();
        cy.get(DashboardSelectors.SAVE).click({ force: true });
        readWidgetConfig(dashboardId).should((cfg) => {
          const popover = (cfg['layers'] as Layer[])[0].config['popoverConfig'] as Record<string, boolean>;
          expect(Object.values(popover).filter((v) => v === false)).to.have.length.at.least(1);
          expect(popover['showAlarms'] === false || popover['showDate'] === false).to.eq(true);
        });
      });
    });

    it('saves map provider, manual center and position polling', () => {
      createDashboard(widgetConfig()).then((dashboardId) => {
        visitDashboard(dashboardId);
        openWidgetForEditing();

        cy.get('[data-cy="layered-map-config--base-layer"]').select('carto-dark');
        cy.get('[data-cy="layered-map-config--auto-center"]').select('Set zoom-level and center map manually');
        cy.get('[data-cy="layered-map-config--center-lat"]').should('be.enabled').clear().type('48.5');
        cy.get('[data-cy="layered-map-config--center-lng"]').clear().type('9.25');
        cy.get('[data-cy="layered-map-config--position-polling"]').select('Use position polling');
        cy.get('[data-cy="layered-map-config--position-polling-interval"]').should('be.enabled');

        saveWidgetConfig();
        cy.get(DashboardSelectors.SAVE).click({ force: true });
        readWidgetConfig(dashboardId).should((cfg) => {
          expect(cfg['baseTileLayerId']).to.eq('carto-dark');
          expect(cfg['autoCenter']).to.eq(false);
          expect(cfg['manualCenter']).to.include({ lat: 48.5, long: 9.25 });
          expect((cfg['positionPolling'] as { enabled: boolean }).enabled).to.eq(true);
        });
      });
    });

    it('opens the center picker modal', () => {
      createDashboard(widgetConfig({ autoCenter: false, manualCenter: { lat: 50, long: 8, zoomLevel: 10 } })).then(visitDashboard);
      openWidgetForEditing();
      cy.get('[data-cy="layered-map-config--center-picker"]').should('be.enabled').click();
      cy.get('c8y-modal .leaflet-container').should('be.visible');
      cy.get('c8y-modal button.btn-default').filter(':visible').contains('Cancel').click();
      cy.get('[data-cy="layered-map-config--center-lat"]').should('have.value', '50');
    });

    it('adds, edits and deletes a custom base layer', () => {
      createDashboard(widgetConfig()).then(visitDashboard);
      openWidgetForEditing();
      cy.intercept('POST', '/inventory/managedObjects').as('createBaseLayers');
      cy.intercept('PUT', '/inventory/managedObjects/*').as('updateBaseLayers');

      cy.get('[data-cy="layered-map-config--custom-base-layer-add"]').click();
      cy.get('ps-custom-base-layer-modal button.btn-primary').filter(':visible').last().as('ok').should('be.disabled');
      cy.get('ps-custom-base-layer-modal input[type="text"]').first().type('My tiles');
      cy.get('ps-custom-base-layer-modal input[type="url"]').type('https://tiles.e2e.example/{z}/{x}/{y}.png', {
        parseSpecialCharSequences: false,
      });
      cy.get('@ok').should('be.enabled').click();
      cy.wait('@createBaseLayers').its('request.body').should((body) => {
        expect(body.type).to.eq('ps_layeredMapBaseLayerConfig');
        expect(body.ps_layeredMapBaseLayers.layers[0]).to.include({ label: 'My tiles' });
      });
      cy.get('[data-cy="layered-map-config--custom-base-layer"]').should('contain.text', 'My tiles');
      cy.get('[data-cy="layered-map-config--base-layer"] optgroup[label="Custom"] option').should('contain.text', 'My tiles');

      cy.get('[data-cy="layered-map-config--custom-base-layer-edit"]').click();
      cy.get('ps-custom-base-layer-modal input[type="text"]').first().clear().type('Renamed tiles');
      cy.get('ps-custom-base-layer-modal button.btn-primary').filter(':visible').last().click();
      cy.wait('@updateBaseLayers');
      cy.get('[data-cy="layered-map-config--custom-base-layer"]').should('contain.text', 'Renamed tiles');

      cy.get('[data-cy="layered-map-config--custom-base-layer-delete"]').click();
      cy.wait('@updateBaseLayers').its('request.body.ps_layeredMapBaseLayers.layers').should('have.length', 0);
      cy.get('[data-cy="layered-map-config--custom-base-layer"]').should('not.exist');
    });

    // Not covered: "Assets" layer type (needs the DTM microservice/app, not available on the
    // mock), popover actions (commented out in the source), track creation (commented out).
  });
});
