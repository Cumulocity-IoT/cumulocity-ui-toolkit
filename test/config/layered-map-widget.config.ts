import { baseConfig } from './base.config';
import layeredMapWidget from '../../packages/layered-map-widget/cumulocity.config';

// No contextPath in cumulocity.config.ts → devkit serves the remote under the
// name-derived context path ("Layered Map Widget" → layered-map-widget), not the
// package name used as key in runTime.remotes.
const contextPath = layeredMapWidget.runTime.name.toLowerCase().replace(/\s+/g, '-');
const remotes = { [contextPath]: Object.values(layeredMapWidget.runTime.remotes)[0] };

export default baseConfig(JSON.stringify(remotes), ['cypress/e2e/layered-map-widget-plugin.cy.ts']);
