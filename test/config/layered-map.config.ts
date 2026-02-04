import { baseConfig } from './base.config';
import map from '../../packages/layered-map/cumulocity.config';

export default baseConfig(JSON.stringify(map.runTime.remotes), [
  `cypress/e2e/cumulocity-layered-map-widget*.cy.ts`,
]);
