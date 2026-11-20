import { IManagedObject } from '@c8y/client';

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Creates a device managed object (`c8y_IsDevice` added) through the inventory API
       * of the current auth (`cy.getAuth()` / `cy.login()`), yields the created object.
       */
      createDevice(options: Record<string, unknown>): Chainable<IManagedObject>;
    }
  }
}

export function registerCommands(): void {
  Cypress.Commands.add('createDevice', (options: Record<string, unknown>) => {
    Cypress.log({ name: 'createDevice', message: String(options['name'] ?? '') });
    return cy
      .c8yclient((c) => c.inventory.create({ ...options, c8y_IsDevice: {} }))
      .then((response) => response.body as IManagedObject);
  });
}
