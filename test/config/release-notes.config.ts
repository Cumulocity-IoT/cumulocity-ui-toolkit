import { baseConfig } from './base.config';
import notes from '../../packages/release-notes/cumulocity.config';

export default baseConfig(JSON.stringify(notes.runTime.remotes), [
  `cypress/e2e/*${notes.runTime.name}*.cy.ts`,
]);
