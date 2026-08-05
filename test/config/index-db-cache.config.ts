import { baseConfig } from './base.config';
import indexDbCache from '../../packages/index-db-cache/cumulocity.config';

export default baseConfig(JSON.stringify(indexDbCache.runTime.remotes), [
  'cypress/e2e/index-db-cache-plugin.cy.ts',
]);
