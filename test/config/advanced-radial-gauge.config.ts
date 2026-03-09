import { baseConfig } from './base.config';
import advancedRadialGaugePlugin from '../../packages/advanced-radial-gauge/cumulocity.config';

export default baseConfig(JSON.stringify(advancedRadialGaugePlugin.runTime.remotes), [
  'cypress/e2e/advanced-radial-gauge-plugin.cy.ts',
]);
