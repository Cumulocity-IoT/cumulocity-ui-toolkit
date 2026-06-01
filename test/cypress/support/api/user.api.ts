import { IUser } from '@c8y/client';

/**
 * Creates a Cumulocity user and assigns them to the named global roles
 * (looked up by role name, not by role-id string).
 *
 * Returns the populated user object (with `id` and `self` set from the
 * creation response) wrapped in a Cypress chainable.
 */
export function createUserWithGlobalRoles(
  user: IUser & { [key: string]: string | boolean },
  roles: string[]
): Cypress.Chainable<IUser & { [key: string]: string | boolean }> {
  return cy
    .c8yclient((c) => c.user.create(user))
    .c8yclient((c, createResponse) => {
      expect(createResponse.status).to.eq(201);
      user.id = createResponse.body.id;
      user.self = createResponse.body.self;
      return c.userGroup.list({ pageSize: 10000 });
    })
    .c8yclient((c, groups) => {
      expect(groups.status).to.eq(200);
      const assignments = roles
        .map((roleName) => (groups.body.groups ?? []).find((g: { name: string }) => g.name === roleName))
        .filter(Boolean)
        .map((group) => c.userGroup.addUserToGroup((group as { id: string }).id!, user.self!));
      return assignments;
    })
    .then(() => cy.wrap(user));
}

/**
 * Deletes each user in `users` (skips entries without an `id`).
 */
export function deleteUsers(users: IUser[]): Cypress.Chainable {
  return cy.c8yclient((c) =>
    users.filter((u) => !!u.id).map((u) => c.user.delete(u.id!))
  );
}

/**
 * Deletes all users whose `userName` starts with `cypress` (case-insensitive).
 * Useful as a blanket cleanup in `before` hooks.
 */
export function cleanupCypressUsers(): Cypress.Chainable {
  return cy
    .c8yclient((c) => c.user.list({ pageSize: 10000, withTotalPages: false }))
    .c8yclient((c, res) => {
      const body = res.body as IUser[] | { users?: IUser[] };
      const users = Array.isArray(body) ? body : body.users ?? [];

      return users
        .filter((u) => u.userName?.toLowerCase().startsWith('cypress'))
        .map((u) => c.user.delete(u.id!));
    });
}
