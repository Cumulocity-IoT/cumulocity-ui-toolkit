type TenantApplicationReference = {
  application?: {
    name?: string;
    key?: string;
  };
};

/**
 * Returns true when the given application name or key is installed for the current tenant.
 */
export function isApplicationInstalled(applicationNameOrKey: string): Cypress.Chainable<boolean> {
  return cy
    .c8yclient((c) => c.tenant.current(), { failOnStatusCode: false })
    .then((response) => {
      const references: TenantApplicationReference[] =
        response.status === 200 ? response.body.applications?.references ?? [] : [];

      return references.some((reference) => {
        const appName = reference.application?.name;
        const appKey = reference.application?.key;
        return appName === applicationNameOrKey || appKey === applicationNameOrKey;
      });
    });
}
