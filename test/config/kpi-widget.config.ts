import { baseConfig } from './base.config';
import kpi from '../../packages/kpi-widget/cumulocity.config';

// The plugin sets no explicit `contextPath`, so @c8y/devkit derives it from `runTime.name`
// (lower-cased, whitespace → '-') and the dev server serves the remote entry under
// `/apps/<contextPath>/`. `runTime.remotes` is keyed by the npm package name instead, which the
// shell cannot resolve — build the remotes from the derived context path.
const contextPath = kpi.runTime.name.toLowerCase().trim().replace(/\s/g, '-');
const remotes = { [contextPath]: kpi.runTime.exports.map((e) => e.module) };

export default baseConfig(JSON.stringify(remotes), [
  `cypress/e2e/cumulocity-kpi-aggregator-widget-plugin*.cy.ts`,
]);
