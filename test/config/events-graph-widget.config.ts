import { baseConfig } from './base.config';
import eventsGraphWidget from '../../packages/events-graph-widget/cumulocity.config';

export default baseConfig(JSON.stringify(eventsGraphWidget.runTime.remotes), [
  'cypress/e2e/events-graph-widget.cy.ts',
]);
