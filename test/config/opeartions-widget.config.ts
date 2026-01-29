import { baseConfig } from './base.config';
import tenantOptionManagement from '../../packages/tenant-option-management/cumulocity.config';

export default baseConfig(JSON.stringify(tenantOptionManagement.runTime.remotes), [
  'cypress/e2e/operations-widget-plugin.cy.ts',
]);
