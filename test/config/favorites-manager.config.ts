import { baseConfig } from './base.config';
import favoritesManager from '../../packages/favorites-manager/cumulocity.config';

export default baseConfig(JSON.stringify(favoritesManager.runTime.remotes), [
  'cypress/e2e/favorites-manager-plugin.cy.ts',
]);
