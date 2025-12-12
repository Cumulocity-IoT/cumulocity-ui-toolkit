import { baseConfig } from './base.config';
import energyConsumptionWidget from '../../packages/energy-consumption-widget/cumulocity.config';

export default baseConfig(JSON.stringify(energyConsumptionWidget.runTime.remotes), [
  'cypress/e2e/energy-consumption-widget-plugin.cy.ts',
]);
