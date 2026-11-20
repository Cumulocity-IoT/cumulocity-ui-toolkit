import { baseConfig } from './base.config';
import navigationAndSearch from '../../packages/navigation-and-search/cumulocity.config';

export default baseConfig(JSON.stringify(navigationAndSearch.runTime.remotes), [
  'cypress/e2e/navigation-and-search-*.cy.ts',
]);
