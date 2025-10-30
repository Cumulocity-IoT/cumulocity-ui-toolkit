import { baseConfig } from './base.config';
import reminder from '../../packages/reminder/cumulocity.config';

export default baseConfig(JSON.stringify(reminder.runTime.remotes), [
  `cypress/e2e/cumulocity-reminder-plugin*.cy.ts`,
]);
