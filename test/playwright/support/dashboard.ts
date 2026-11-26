// The shell's dashboard: the ui-sdk's Playwright drivers on the generated selectors (`pnpm -C test exec c8y-ui
// selectors`). `drivers(page, selectors).dashboard` enters edit mode, adds and edits widgets and saves;
// `.widgetConfig` saves or cancels the configuration. What is left here is what the drivers do not cover.
import { drivers } from '@cumulocity-iot/ui-sdk/playwright';
import type { Page } from '@playwright/test';
import { selectors } from '../selectors';

/** The dashboard is ready: "Edit widgets", or "Add widget" on an empty dashboard. A `waitFor` for `visitApp`. */
export const DASHBOARD_READY = `${selectors.widgetsDashboard.editWidgets}, ${selectors.widgetsDashboard.widgetDashboardAddWidget}`;

/** The shell's drivers with this repository's selectors: `const { dashboard, widgetConfig } = shell(page)`. */
export const shell = (page: Page) => drivers(page, selectors);
