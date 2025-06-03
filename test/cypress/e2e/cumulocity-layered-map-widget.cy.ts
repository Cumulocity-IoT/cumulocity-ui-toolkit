/// <reference types="cypress" />

import { IManagedObject } from '@c8y/client';
import {
  mockAlarm,
  mockChildAssetsResponse,
  mockDashboard,
  mockListResponse,
  mockManagedObject,
  mockWidget,
  widgetDimensions,
} from '../support/utils';

function mockLayeredMapWidget(device: Partial<IManagedObject>, config: any) {
  const widget = mockWidget({
    componentId: 'iot.cumulocity.layered.map.widget',
    title: 'Layered map widget',
    config,
    ...widgetDimensions(0, 0, 24, 10),
  });
  const dashboard = mockDashboard(device, [widget]);
  cy.intercept('GET', `inventory/managedObjects?*c8y_Dashboard!device!${device.id}*`, {
    ...mockListResponse([dashboard]),
  });
  cy.intercept('GET', `inventory/managedObjects/${device.id}*`, device);
  cy.intercept('GET', `inventory/managedObjects/${device.id}?withChildren=false`, device);
  cy.intercept('GET', `inventory/managedObjects/${device.id}?withParents=true`, device);
  cy.intercept('GET', `inventory/managedObjects/${device.id}`, device);
  cy.intercept('GET', `inventory/managedObjects/${device.id}/childDevices*`, {
    ...mockChildAssetsResponse([], { pageSize: 1, currentPage: 1 }),
  });
}

describe('Layered map', () => {
  const device = {
    ...mockManagedObject(),
    name: 'Test device',
  };

  context('Inventory layer', () => {
    const inventoryConfig = {
      manualCenter: {
        zoomLevel: 15,
        lat: 51.339915361873395,
        long: 12.376184463500978,
      },
      saved: true,
      layers: [
        {
          active: true,
          config: {
            filter: {
              query: '$filter=(has(c8y_IsDevice) and has(c8y_Position))',
            },
            enablePolling: 'false',
            color: '#f44848',
            name: 'Test layer',
            icon: 'marker',
            pollingInterval: 5,
            type: 'Inventory',
          },
        },
      ],
      autoCenter: 'false',
      positionPolling: {
        interval: 1,
        enabled: 'true',
      },
    };

    beforeEach(() => {
      cy.getAuth().login();
    });

    it('Verify proper setup', () => {
      mockLayeredMapWidget(device, inventoryConfig);
      cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', 'c8y-layered-map-widget');
      cy.get('button[data-cy="c8y-widget-dashboard--edit-widgets"]').click({ force: true });
      cy.get('button[data-cy="c8y-dashboard-child--settings"]').click({ force: true });
      cy.get('button[data-cy="widgets-dashboard--Edit-widget"]').click({ force: true });
      cy.get('c8y-layered-map-widget-config').should('be.visible');
    });

    it('Marker movement should be tracked', () => {
      mockLayeredMapWidget(device, inventoryConfig);
      cy.fixture('map-route').then((route) => {
        cy.intercept(
          'GET',
          'inventory/managedObjects?withTotalPages=true&pageSize=2000&query=%24filter%3D(has(c8y_IsDevice)%20and%20has(c8y_Position))*',
          {
            ...mockListResponse([
              { ...device, c8y_Position: { lat: route.coords[0][1], lng: route.coords[0][0] } },
            ]),
          }
        );

        let i = 0;
        cy.intercept(
          'GET',
          'inventory/managedObjects?pageSize=200&withTotalPages=false&query=%24filter%3D(has(c8y_Position)%20and%20lastUpdated.date%20gt%20%*',
          (req) => {
            const coord = route.coords[i];
            req.reply({
              statusCode: 200,
              body: {
                ...mockListResponse([
                  { ...device, c8y_Position: { lat: coord[1], lng: coord[0] } },
                ]),
              },
            });
            i += 5;
          }
        ).as('getPositions');

        cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', 'c8y-layered-map-widget');

        let previousTransform = undefined;
        for (let j = 0; j < route.coords.length; j += 5) {
          cy.wait('@getPositions');
          cy.wait(500);
          cy.get('.c8y-map-marker-icon')
            .invoke('attr', 'style')
            .then((style) => {
              const transformMatch = style.match(/transform:\s*(translate3d\([^)]+\))/);
              const currentTransform = transformMatch ? transformMatch[1] : undefined;

              if (previousTransform) {
                expect(currentTransform).to.not.equal(previousTransform);
              }

              previousTransform = currentTransform;
            });
        }
      });
    });

    it('Addition and removal should be tracked', () => {
      const myConfig = { ...inventoryConfig, positionPolling: { enabled: 'false', interval: 60 } };
      myConfig.layers[0].config.enablePolling = 'true';
      myConfig.layers[0].config.pollingInterval = 1;
      mockLayeredMapWidget(device, myConfig);
      cy.fixture('map-route').then((route) => {
        let devices: IManagedObject[] = [];
        for (let i = 1; i < 6; i++) {
          devices.push({
            ...device,
            id: `${device.id}-${i}`,
            name: `${device.name} #${i}`,
            c8y_Position: { lat: route.coords[i * 10][1], lng: route.coords[i * 10][0] },
          });
        }

        let j = 0;
        cy.intercept(
          'GET',
          'inventory/managedObjects?withTotalPages=true&pageSize=2000&query=%24filter%3D(has(c8y_IsDevice)%20and%20has(c8y_Position))*',
          (req) => {
            req.reply({
              statusCode: 200,
              body: {
                ...mockListResponse([devices[j]]),
              },
            });
            j++;
          }
        ).as('addAndRemove');

        cy.intercept(
          'GET',
          'inventory/managedObjects?pageSize=200&withTotalPages=false&query=%24filter%3D(has(c8y_Position)%20and%20lastUpdated.date%20gt%20%*',() => {
            expect(false, 'Position Polling should not be called').to.be.true;
          }
        );

        cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', 'c8y-layered-map-widget');

        let previousTransform = undefined;
        devices.forEach(() => {
          cy.wait('@addAndRemove');
          cy.wait(200);
          cy.get('.c8y-map-marker-icon')
            .should('have.length', 1)
            .its('0.style.transform')
            .should((currentTransform) => {
              expect(currentTransform).to.not.equal(previousTransform);
              previousTransform = currentTransform;
            });
        });
      });
    });
  });

  context('Alarm layer', () => {
    const alarmConfig = {
      manualCenter: {
        zoomLevel: 15,
        lat: 51.339915361873395,
        long: 12.376184463500978,
      },
      saved: true,
      layers: [
        {
          active: true,
          config: {
            filter: {
              resolved: false,
            },
            enablePolling: 'true',
            color: '',
            name: 'Alarm test',
            icon: 'notification',
            pollingInterval: 1,
            type: 'Alarm',
          },
        },
      ],
      autoCenter: 'false',
      positionPolling: {
        interval: 5,
        enabled: 'false',
      },
    };

    beforeEach(() => {
      cy.getAuth().login();
      mockLayeredMapWidget(device, alarmConfig);
    });

    it('Test alarm colors', () => {
      let alarm = mockAlarm(device);
      cy.fixture('map-route').then((route) => {
        cy.intercept(
          'GET',
          'alarm/alarms?withTotalPages=true&pageSize=100&resolved=false',
          mockListResponse([alarm])
        );

        let i = 0;
        cy.intercept(
          'GET',
          `inventory/managedObjects?ids=${device.id}&fragmentType=c8y_Position&withChildren=false&pageSize=100&withTotalPages=false`,
          (req) => {
            let c8y_ActiveAlarmsStatus;
            switch (i) {
              case 0:
                c8y_ActiveAlarmsStatus = { warning: 1 };
                break;
              case 1:
                c8y_ActiveAlarmsStatus = { minor: 1 };
                break;
              case 2:
                c8y_ActiveAlarmsStatus = { major: 1 };
                break;
              case 3:
                c8y_ActiveAlarmsStatus = { critical: 1 };
            }

            req.reply({
              statusCode: 200,
              body: mockListResponse([
                {
                  ...device,
                  c8y_Position: {
                    lat: route.coords[0][1],
                    lng: route.coords[0][0],
                  },
                  c8y_ActiveAlarmsStatus,
                },
              ]),
            });
            i++;
          }
        ).as('getAlarmMOs');
      });

      cy.visitShellAndWaitForSelector(`device/${device.id}`, 'en', 'c8y-layered-map-widget');

      ['warning', 'minor', 'major', 'critical'].forEach((s) => {
        cy.wait('@getAlarmMOs', { timeout: 10000 });
        cy.get('div.map-container')
          .find('i.dlt-c8y-icon-notification')
          .parent()
          .should('have.class', s);
      });
    });
  });
});
