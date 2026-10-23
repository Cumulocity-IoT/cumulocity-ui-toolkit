import { baseConfig } from './base.config';
import assetNavigator from '../../packages/asset-navigator/cumulocity.config';

export default baseConfig(JSON.stringify(assetNavigator.runTime.remotes), [
  'cypress/e2e/asset-navigator-*.cy.ts',
]);
