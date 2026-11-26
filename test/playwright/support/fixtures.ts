// The ui-sdk fixtures, with `visitApp` settling the frozen clock: in a `--frozen` run the page's `Date` stands
// still, and the cockpit shell waits on it at startup (`HeaderService.verifyIfNavOpen` opens the navigator through
// `debounceTime(300)`, armed a second after the drawer items arrive; RxJS debounces compare two `Date.now()`
// readings). `settleClock` moves the clock a fixed number of times, so every such debounce fires and two runs still
// render the same. In a normal run nothing happens.
import type { Page } from '@playwright/test';
import { expect, test as base } from '@cumulocity-iot/ui-sdk/playwright';

export { expect };

/**
 * Lets the debounces of a frozen page fire: `rounds` × (`Date` + 1 s, then 300 ms of real time for the timers).
 * Call it after an action that arms a debounce in the app (an in-app navigation, typing into a search field);
 * `visitApp` calls it. Moves the clock the fixtures install (`window.__c8yClock`, what `advanceClock` moves), so a
 * support helper can call it without the fixture.
 */
export async function settleClock(page: Page, rounds = 8): Promise<void> {
  if (!process.env.C8Y_FROZEN_NOW) return;

  for (let i = 0; i < rounds; i++) {
    await page.evaluate(() => {
      const clock = (window as { __c8yClock?: { now: number } }).__c8yClock;

      if (clock) clock.now += 1000;
    });
    await page.waitForTimeout(300);
  }
}

export const test = base.extend({
  visitApp: async ({ visitApp, page }, use) => {
    await use(async (path, options) => {
      await visitApp(path, options);
      await settleClock(page);
    });
  },
  // Web fonts that are still loading render as the fallback font, so the same view differs by a few hundred
  // pixels of glyph edges between two runs: wait for them before the picture.
  reviewScreenshot: async ({ reviewScreenshot, page }, use) => {
    await use(async (name, options) => {
      await page.evaluate(() => document.fonts.ready);
      await reviewScreenshot(name, options);
    });
  },
});
