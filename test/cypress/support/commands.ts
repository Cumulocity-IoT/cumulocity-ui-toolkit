import { IIdentified, IManagedObject, IUser, IUserGroup } from '@c8y/client';
import {
  createGroup as createGroupApi,
  createDevice as createDeviceApi,
  assignToGroup,
  createGroupHierarchy as createGroupHierarchyApi,
  GroupHierarchy,
} from './api/inventory.api';
import {
  configureApplicationAccess as configureApplicationAccessApi,
  createInventoryRoleWithPermissions as createInventoryRoleWithPermissionsApi,
  assignInventoryRoleToGroupForUser as assignInventoryRoleToGroupForUserApi,
  deleteInventoryRole as deleteInventoryRoleApi,
  InventoryRolePermission,
} from './api/role.api';
import {
  createUserWithGlobalRoles as createUserWithGlobalRolesApi,
  deleteUsers as deleteUsersApi,
} from './api/user.api';

// C8yLanguage matches the type from cumulocity-cypress/lib/commands/general.d.ts
type C8yLanguage = 'de' | 'en';

/** Handler type for cy.intercept — compatible with Cypress 15. */
type InterceptHandler = Parameters<typeof cy.intercept>[2];

// Extend the Cypress chainable interface so TypeScript knows about our custom commands.
// NOTE: createGlobalRole and deleteGlobalRoles are provided by cumulocity-cypress 1.x
// and are intentionally omitted here to avoid signature conflicts.
declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Visits the shell application at `url`, sets the UI language, optionally
       * injects remote module federation entries from `C8Y_SHELL_EXTENSION`, and
       * waits for `selector` to be visible before resolving.
       */
      visitShellAndWaitForSelector(
        url: string,
        language?: C8yLanguage,
        selector?: string,
        timeout?: number
      ): Chainable<void>;
      /** Creates a device group managed object via the C8Y inventory API. */
      createGroup(options: Record<string, unknown>): Chainable<IManagedObject>;
      /** Creates a device managed object via the C8Y inventory API. */
      createDevice(options: Record<string, unknown>): Chainable<IManagedObject>;
      /**
       * Assigns the subject device as a child asset of `groupId`.
       * Chains off `createDevice` (or any command yielding an `IManagedObject`).
       */
      assignDevice(groupId: string): Chainable<IManagedObject>;
      /**
       * Intercepts GET requests for dashboard managed objects scoped to a device or group.
       */
      interceptDashboardLoad(
        id: string,
        context: 'device' | 'group',
        handler: InterceptHandler
      ): Chainable<null>;
      /** Recursively creates a group hierarchy, populating the `id` field of each node. */
      createGroupHierarchy(hierarchy: GroupHierarchy, cy_testId: string): Chainable;
      /** Adds the listed application names to the role's application access list. */
      configureApplicationAccess(role: IUserGroup, applicationNames: string[]): Chainable;
      /** Creates an inventory role with the given permissions. */
      createInventoryRoleWithPermissions(
        name: string,
        permissions: InventoryRolePermission[],
        description?: string
      ): Chainable;
      /** Assigns an inventory role to a user for a given managed object (group). */
      assignInventoryRoleToGroupForUser(
        inventoryRole: IIdentified,
        groupId: string,
        user: IUser
      ): Chainable;
      /** Deletes the inventory role identified by `name`. */
      deleteInventoryRole(name: string): Chainable;
      /**
       * Creates a Cumulocity user and assigns them to the named global roles
       * (looked up by role name).
       */
      createUserWithGlobalRoles(
        user: IUser & { [key: string]: string | boolean },
        roles: string[]
      ): Chainable<IUser & { [key: string]: string | boolean }>;
      /** Deletes each user in `users` (skips entries without an `id`). */
      deleteUsers(users: IUser[]): Chainable;
    }
  }
}

export function registerCommands(): void {
  Cypress.Commands.add('createGroup', (options: Record<string, unknown>) =>
    cy.c8yclient((c) => createGroupApi(c, options)).then((response) => response.body as IManagedObject)
  );

  Cypress.Commands.add('createDevice', (options: Record<string, unknown>) =>
    cy.c8yclient((c) => createDeviceApi(c, options)).then((response) => response.body as IManagedObject)
  );

  Cypress.Commands.add('assignDevice', { prevSubject: true }, (device: IManagedObject, groupId: string) => {
    cy.c8yclient((c) => assignToGroup(c, groupId, device.id));
    cy.wrap(device);
  });

  Cypress.Commands.add('interceptDashboardLoad', (id: string, context: 'device' | 'group', handler: InterceptHandler) => {
    cy.intercept('GET', `inventory/managedObjects?*c8y_Dashboard!${context}!${id}*`, handler as never);
  });

  Cypress.Commands.add('createGroupHierarchy', (hierarchy: GroupHierarchy, cy_testId: string) =>
    createGroupHierarchyApi(hierarchy, cy_testId)
  );

  Cypress.Commands.add('configureApplicationAccess', (role: IUserGroup, applicationNames: string[]) =>
    configureApplicationAccessApi(role, applicationNames)
  );

  Cypress.Commands.add('createInventoryRoleWithPermissions', (name: string, permissions: InventoryRolePermission[], description?: string) =>
    createInventoryRoleWithPermissionsApi(name, permissions, description)
  );

  Cypress.Commands.add('assignInventoryRoleToGroupForUser', (inventoryRole: IIdentified, groupId: string, user: IUser) =>
    assignInventoryRoleToGroupForUserApi(inventoryRole, groupId, user)
  );

  Cypress.Commands.add('deleteInventoryRole', (name: string) =>
    deleteInventoryRoleApi(name)
  );

  Cypress.Commands.add('createUserWithGlobalRoles', (user: IUser & { [key: string]: string | boolean }, roles: string[]) =>
    createUserWithGlobalRolesApi(user, roles)
  );

  Cypress.Commands.add('deleteUsers', (users: IUser[]) =>
    deleteUsersApi(users)
  );

  Cypress.Commands.add(
    'visitShellAndWaitForSelector',
    (
      url: string,
      language: C8yLanguage = 'en',
      selector = 'c8y-navigator-outlet c8y-app-icon',
      timeout = Cypress.config().pageLoadTimeout ?? 60_000
    ) => {
      if (Cypress.expose('C8Y_SHELL_TARGET')) {
        const app = Cypress.expose('C8Y_SHELL_TARGET');
        url = `/apps/${app}/index.html#/${url}`;
      }

      Cypress.log({
        name: 'visitShellAndWaitForSelector',
        message: url,
        consoleProps: () => ({ url, language, selector, timeout }),
      });

      cy.setLanguage(language);

      if (Cypress.expose('C8Y_SHELL_EXTENSION')) {
        cy.visit(url, { qs: { remotes: Cypress.expose('C8Y_SHELL_EXTENSION') } });
      } else {
        cy.visit(url);
      }

      cy.get(selector, { timeout }).should('be.visible');
    }
  );
}
