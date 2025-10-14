export {};

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Visit a page and load the plugin modules
       */
      visitShellAndWaitForSelector(
        url: string,
        language?: C8yLanguage,
        selector?: string,
        timeout?: number
      ): Chainable<void>;
    }
  }
}

export function registerCommands() {
  Cypress.Commands.add(
    'visitShellAndWaitForSelector',
    (
      url: string,
      language = 'en',
      selector = 'c8y-navigator-outlet c8y-app-icon',
      timeout = Cypress.config().pageLoadTimeout || 60000
    ) => {
      if (Cypress.env('C8Y_SHELL_TARGET')) {
        const app = Cypress.env('C8Y_SHELL_TARGET');

        url = `/apps/${app}/index.html#/${url}`;
      }

      const consoleProps = {
        url,
        language,
        selector,
        timeout,
      };

      Cypress.log({
        name: 'visitShellAndWaitForSelector',
        message: url,
        consoleProps: () => consoleProps,
      });
      cy.setLanguage(language);

      if (Cypress.env('C8Y_SHELL_EXTENSION')) {
        const plugins = Cypress.env('C8Y_SHELL_EXTENSION');
        const qs = { remotes: plugins };

        cy.visit(`${url}`, { qs });
      } else {
        cy.visit(url);
      }
      cy.get(selector, { timeout }).should('be.visible');
    }
  );
}
