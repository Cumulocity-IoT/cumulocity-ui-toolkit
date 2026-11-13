import { baseConfig } from './base.config';
import kpiTrendWidget from '../../packages/kpi-trend-widget/cumulocity.config';

export default baseConfig(JSON.stringify(kpiTrendWidget.runTime.remotes), [
  'cypress/e2e/kpi-trend-widget.cy.ts',
]);
