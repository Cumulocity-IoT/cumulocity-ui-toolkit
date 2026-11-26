// The navigation-and-search plugin's data-cy hooks and the steps every one of its specs takes: the "Tree" navigator
// entry, the explorer drawer, its rows and the settings drawer. Plugin-specific, so it lives here and not in the
// ui-sdk (whose Playwright entry has no page objects; its Cypress page objects cover the shell's dashboard only).
import type { Locator, Page } from '@playwright/test';
import { selectors } from '../selectors';
import { expect } from './fixtures';

/** `[data-cy="navigation-and-search--<name>"]` */
export const cy = (name: string) => `[data-cy="navigation-and-search--${name}"]`;

/** The "Tree" entry of the shell's navigator (the node's data-cy is its label; scoped to the node's button). */
export const NAV_NODE = `c8y-navigator-node button${selectors.navigatorNode.label('Tree')}`;
export const DRAWER = cy('drawer');
export const BACKDROP = cy('backdrop');
export const ROW = cy('row');
export const ROW_NAME = cy('row-name');
export const FILTER = cy('filter');
export const PIN = cy('pin');
export const GRIP = cy('grip');
export const DETAIL = cy('detail');
export const FIELD = cy('detail-field');
export const FIELDCFG = cy('fieldcfg');
export const PREVIEW = cy('settings-preview');
export const SETTINGS = cy('settings');
export const SETTINGS_OPEN = cy('settings-open');
export const SETTINGS_DONE = cy('settings-done');
export const FOOTER_COUNT = cy('footer-count');
/** The global search button in the header (`globalSearchViewProviders`). */
export const TRIGGER = 'ps-search-trigger button.main-header-button';

export const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Anchored, whitespace-tolerant: locators are strict and names share prefixes. */
export const exact = (text: string) => new RegExp(`^\\s*${escape(text)}\\s*$`);

export type VisitApp = (path?: string, o?: object) => Promise<void>;

export function rowNamed(page: Page, name: string): Locator {
  return page.locator(ROW).filter({ has: page.locator(ROW_NAME, { hasText: exact(name) }) });
}

/** The shell root, the "Tree" navigator entry clicked, the drawer open with its first row. */
export async function openDrawer(page: Page, visitApp: VisitApp): Promise<void> {
  await visitApp('', { language: 'en', waitFor: NAV_NODE });
  await page.locator(NAV_NODE).click();
  await expect(page.locator(DRAWER)).toBeVisible();
  await expect(page.locator(ROW).first()).toBeVisible({ timeout: 30_000 });
}

/** The settings bottom drawer (cog next to the pin). */
export async function openSettings(page: Page): Promise<void> {
  await page.locator(SETTINGS_OPEN).click();
  await expect(page.locator(SETTINGS)).toBeVisible();
}

/** The settings drawer on one of its tabs (`levels`, `filter`, …). */
export async function openSettingsTab(page: Page, tab: string): Promise<void> {
  await openSettings(page);
  const tabButton = page.locator(cy(`settings-tab-${tab}`));

  await tabButton.click();
  await expect(tabButton).toHaveAttribute('aria-selected', 'true');
}

export async function closeSettings(page: Page): Promise<void> {
  await page.locator(SETTINGS_DONE).click();
  await expect(page.locator(SETTINGS)).toHaveCount(0);
}

/** The level entry of `type` on the "by level" tabs (`null`: the default entry). */
export function levelChip(page: Page, type: string | null): Locator {
  return type === null
    ? page.locator(cy('settings-level-default'))
    : page.locator(`${cy('settings-level')}[data-type="${type}"]`);
}

/** The settings drawer, "by level" tab, on the entry of `type` (`null`: the default). */
export async function openLevel(page: Page, type: string | null): Promise<void> {
  await openSettingsTab(page, 'levels');
  await levelChip(page, type).click();
  await expect(levelChip(page, type)).toHaveAttribute('aria-selected', 'true');
}
