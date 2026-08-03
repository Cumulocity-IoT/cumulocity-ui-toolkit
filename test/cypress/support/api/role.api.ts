import { IIdentified, IRole, IUser, IUserGroup } from '@c8y/client';

export type InventoryRolePermission = {
  scope: 'ALARM' | 'EVENT' | 'MANAGED_OBJECT' | 'MEASUREMENT' | 'AUDIT' | 'OPERATION' | '*';
  /** ADMIN = change, READ = read-only, * = all */
  permission: 'ADMIN' | '*' | 'READ';
  type: string;
};

// ---------------------------------------------------------------------------
// Global roles
// ---------------------------------------------------------------------------

/**
 * Creates a global role group with the given `permissions` (role-id strings
 * like `ROLE_THRESHOLD_SETTINGS_READ`) and returns the created `IUserGroup`.
 */
export function createGlobalRole(
  name: string,
  permissions: string[],
  description?: string
): Cypress.Chainable<IUserGroup> {
  let role: IUserGroup;

  return cy
    .c8yclient((c) => c.userGroup.create({ name, description }))
    .c8yclient((c, res) => {
      expect(res.body).to.not.be.undefined;
      role = res.body;
      return c.userRole.list({ pageSize: 2000, withTotalPages: false });
    })
    .c8yclient((c, res) => {
      const roles: IRole[] = res.body.roles ?? [];
      const matches = roles.filter((r) => permissions.includes((r.id ?? '').toString()));
      expect(matches.length, `At least one role matched for "${name}"`).to.be.greaterThan(0);
      return matches.map((match) => c.userGroup.addRoleToGroup(role.id!, match.self!));
    })
    .then(() => cy.wrap(role));
}

/**
 * Deletes all global role groups whose `name` is in `groupNames`.
 */
export function deleteGlobalRoles(groupNames: string[]): Cypress.Chainable {
  return cy
    .c8yclient((c) => c.userGroup.list({ pageSize: 2000 }))
    .c8yclient(
      (c, res) => {
        return (res.body.groups ?? [])
          .filter((g: { name: string }) => groupNames.includes(g.name))
          .map((g: IUserGroup) => c.userGroup.delete(g));
      },
      { failOnStatusCode: false }
    );
}

// ---------------------------------------------------------------------------
// Inventory roles
// ---------------------------------------------------------------------------

/**
 * Creates an inventory role with the given `permissions`. If a role with the
 * same `name` already exists (409) it is looked up and returned instead.
 */
export function createInventoryRoleWithPermissions(
  name: string,
  permissions: InventoryRolePermission[],
  description?: string
): Cypress.Chainable {
  return cy
    .c8yclient((c) => c.role.create({ name, permissions, description }), {
      failOnStatusCode: false,
    })
    .then((response) => {
      if (response.status === 201) {
        return response.body;
      } else if (response.status === 409) {
        return getInventoryRoleByName(name);
      }
      return undefined;
    });
}

/** Looks up a single inventory role by its display name. */
export function getInventoryRoleByName(name: string): Cypress.Chainable {
  return cy
    .c8yclient((c) => c.role.list({ pageSize: 2000 }))
    .then((res) => (res.body.roles ?? [] as IRole[]).find((r) => r.name === name));
}

/** Deletes the inventory role identified by `name`. */
export function deleteInventoryRole(name: string): Cypress.Chainable {
  return cy
    .c8yclient((c) => c.role.list({ pageSize: 2000 }))
    .c8yclient(
      (c, res) =>
        ((res.body.roles ?? []) as IRole[])
          .filter((r) => r.name === name)
          .map((r) => c.role.delete(r as IIdentified)),

      { failOnStatusCode: false }
    );
}

// ---------------------------------------------------------------------------
// Assignments
// ---------------------------------------------------------------------------

/**
 * Assigns an inventory role to `user` for the managed object identified by
 * `groupId`. Returns the created assignment object.
 */
export function assignInventoryRoleToGroupForUser(
  inventoryRole: IIdentified,
  groupId: string,
  user: IUser
): Cypress.Chainable {
  return cy
    .c8yclient((c) =>
      c.user.inventoryAssignment(user).create({ roles: [inventoryRole], managedObject: groupId })
    )
    .then((res) => {
      expect(res.status).to.eq(200);
      return res.body;
    });
}

/**
 * Adds the listed `applicationNames` (matched by key substring) to the group's
 * application access list.
 */
export function configureApplicationAccess(
  role: IUserGroup,
  applicationNames: string[]
): Cypress.Chainable {
  return cy
    .c8yclient((c) => c.application.list({ pageSize: 2000, withTotalPages: false }))
    .c8yclient((c, res) => {
      const apps = (res.body.applications ?? []).filter((app: { key: string }) =>
        applicationNames.some((name) => app.key.includes(name))
      );
      expect(apps.length, 'At least one application matched').to.be.greaterThan(0);
      return c.userGroup.update({ ...role, applications: apps });
    });
}
