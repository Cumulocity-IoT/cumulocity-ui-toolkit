import { baseConfig } from './base.config';
import operationsWidget from '../../packages/operations-widget/cumulocity.config';

export default baseConfig(JSON.stringify(operationsWidget.runTime.remotes), [
  'cypress/e2e/operations-widget-plugin.cy.ts',
]);
