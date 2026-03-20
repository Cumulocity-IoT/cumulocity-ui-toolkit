import { baseConfig } from './base.config';
import layeredMapWidget from '../../packages/layered-map-widget/cumulocity.config';

export default baseConfig(JSON.stringify(layeredMapWidget.runTime.remotes), [
  'cypress/e2e/layered-map-widget.cy.ts',
]);
