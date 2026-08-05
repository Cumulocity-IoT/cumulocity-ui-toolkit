import { baseConfig } from './base.config';
import smartViews from '../../packages/smart-views/cumulocity.config';

export default baseConfig(JSON.stringify(smartViews.runTime.remotes), [
  'cypress/e2e/smart-views-plugin.cy.ts',
]);
