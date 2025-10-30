import { baseConfig } from './base.config';
import kpi from '../../packages/kpi-widget/cumulocity.config';

export default baseConfig(JSON.stringify(kpi.runTime.remotes), [
  `cypress/e2e/cumulocity-kpi-aggregator-widget-plugin*.cy.ts`,
]);
