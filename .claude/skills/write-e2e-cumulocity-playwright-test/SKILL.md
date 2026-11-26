---
name: write-e2e-cumulocity-playwright-test
description: Write, update, and verify end-to-end Playwright tests for Cumulocity UI plugins on the @cumulocity-iot/ui-sdk tenant mock. Use when asked to create or fix e2e tests for a Cumulocity feature or bug, or when e2e tests fail in CI. Covers backend request discovery, arranging state on the mock, request assertions, and an autonomous run-analyze-fix verification loop.
license: Apache-2.0
metadata:
  author: Christian Guether, Hendrik Näther
  version: "4.0"
---

# Write and verify e2e Playwright tests for Cumulocity

You are writing deterministic Playwright test code, validating it yourself in a loop until it passes. A test is not done until you have run it headlessly on the tenant mock and seen it green.

**Workflow at a glance:**

0. **Preflight** — the test workspace is installed, the browser is there, the world file exists.
1. **Discover** — walk the flow in a live browser (selectors, requests, response shapes), then confirm the backend contract in the Angular service source.
2. **Write** — the suite skeleton with the ui-sdk fixtures, state arranged on the mock, stable selectors, request assertions.
3. **Verify** — run the plugin's suite headlessly in a loop, diagnose from the trace, fix, repeat.
4. **Finish** — delete run output, report pass/fail counts, fold new lessons back into this skill.

Everything runs against the tenant mock, never against a real tenant: no credentials, no cleanup calls, no writes anybody has to undo. Read `test/AGENTS.md` first: it documents the fixtures, the support helpers and the mock.

## Phase 0 — Preflight

1. `pnpm install` at the root (it covers `test/`) and the browser is installed: `pnpm run e2e:install` (once per machine; `--with-deps` in CI).
2. `test/mock/windy-dev.json` exists; `pnpm run e2e:mock` pulls it otherwise (needs go-c8y-cli and a windy-dev session, see `test/AGENTS.md`).
3. Ports: the run starts the mock on 8111 and the plugin's dev server on 9001. When either is taken (`lsof -nP -iTCP:8111 -iTCP:9001 -sTCP:LISTEN`), pick free ones with `E2E_MOCK_PORT` / `E2E_DEV_PORT` instead of killing a process you did not start. A dev server already on the port answers the readiness check and the run then tests the wrong build.

## Phase 1 — Discover the feature: browser first, then source

### 1a. Walk the flow live in the browser

Start `pnpm run dev <plugin>` (hot reload on the mock) or `pnpm run e2e:mock <plugin> --open` (Playwright UI mode) and walk the actual user flow before reading `node_modules` or writing a line. Record in one pass:

- **The rendered DOM**: `data-cy` attributes, component tags, `title` / `aria-label` hooks on every element the test will touch. This yields the real selectors, including the built-in hooks of `@c8y/ngx-components`, with zero guessing.
- **The network traffic**: which requests fire on route load vs. on user action, their order, methods and query params.
- **The real response shapes**: copy a live response as the template for a `page.route` body when one is needed.

Do **not** discover widget internals by grepping minified `@c8y/ngx-components` bundles. Fallback order without a live browser: an existing passing spec in `test/playwright/` → the `c8y-web-sdk-knowledge` MCP for component APIs and hooks → run the test once and read the DOM from the failure trace (`pnpm -C test exec playwright show-trace test/playwright-results/<test>/trace.zip`).

### 1b. Confirm the backend contract from the source code

**Never guess request URLs.** Read the Angular service(s) the component injects (`*.service.ts`): collect every endpoint constant and every `fetchClient.fetch(...)` / `inventoryService.*` / `measurementService.*` call. For each user flow, list the requests it triggers, grouped by trigger:

- **on init** (`ngOnInit`): GETs that populate forms and grids. Their data must be on the mock (world or `api`) before `visitApp`.
- **on action** (save / delete / confirm): POST / PUT / DELETE. Assert the request body (`page.waitForRequest`) or the result on the mock (`expect.poll(() => api.get(...))`).
- **side calls** that could interfere (permission lookups, `currentTenant`, option fetches).

## Phase 2 — Write the test

### File location and naming

- `test/playwright/<plugin>[-<area>].spec.ts`. The name starts with the package folder name: the config runs `<plugin>*.spec.ts` for one plugin and CI derives the plugin list from the names.
- One `test.describe` per feature area; test names state observable behavior ("shows an error alert when saving fails").

### Suite skeleton

```ts
import { expect, settleClock, test } from './support/fixtures'; // the ui-sdk fixtures, visitApp settling a frozen clock
import type { APIRequestContext, Page } from '@playwright/test';

test.describe('<Feature name>', () => {
  let device: { id: string; name: string };

  test.beforeAll(async ({ mock, api }) => {
    await mock.reset();
    device = (await (await api.get('/inventory/managedObjects?fragmentType=c8y_IsDevice&pageSize=1')).json()).managedObjects[0];
  });

  test.beforeEach(async ({ mock }) => {
    await mock.reset(); // the world as loaded, request log cleared: nothing leaks between tests
  });

  test('…', async ({ page, api, visitApp }) => {
    // 1. arrange state on the mock (api)  2. visitApp  3. interact  4. assert UI, request bodies or mock state
  });
});
```

The fixtures log the page in; there is no login code in a spec.

### Navigation

`visitApp(path, { language: 'en', waitFor })` opens `/apps/cockpit/index.html?remotes=<plugin remotes>#/<path>`, sets the UI language and waits for the anchor to be visible. Never `page.goto` an app URL by hand.

```ts
await visitApp('', { language: 'en', waitFor: '#navigator' });                     // shell root
await visitApp(`device/${device.id}`, { language: 'en', waitFor: 'c8y-tabs-outlet' }); // device context
```

The shell's components are driven through `shell(page)` from `test/playwright/support/dashboard.ts` (the ui-sdk's `drivers(page, selectors)`): `dashboard.addWidget(name)`, `dashboard.editWidget(n)`, `widgetConfig.section(title)`, `widgetConfig.save()`, `dashboard.save()`, `dataGrid().row(text)`, `confirmModal.confirm()`, `alerts.messages`. Do not rewrite those steps in a spec.

Have **one** test navigate by clicking (navigator entry, tab), so `hookNavigator` / `hookTab` registration is covered; the rest may deep-link to the route with the plugin component's selector as the anchor.

### State and requests — the rules

1. **Arrange state on the mock, not in intercepts.** `api.post('/inventory/managedObjects', { data })`, `api.put('/user/currentUser', …)`, `api.post('/tenant/options', …)`; `mock.loadWorld(world)` for things only the world can express (availability: `test/playwright/support/availability.ts`).
2. **`page.route` only for what the mock cannot hold**: failures (`route.fulfill({ status: 500, json })`, `{ times: 1 }`), a response changed in flight (`const response = await route.fetch(); await route.fulfill({ response, json: changed })`). Register it before `visitApp` when the request fires on load; `route.fallback()` for the methods you do not handle.
3. **Assert what the app sent**: `const req = page.waitForRequest((r) => r.method() === 'PUT' && r.url().includes('/inventory/managedObjects/'))` **before** the click, then `expect((await req).postDataJSON()).toMatchObject(...)`. Or read the result back from the mock with `expect.poll`.
4. **Failure paths too**: the same action with a 500 route and the error alert asserted (`c8y-alert-outlet div[data-cy="c8y-alert--message"].alert-danger`).
5. Response bodies in routes must match the TypeScript interfaces the service parses: copy a live shape (Phase 1a), or build it with `@cumulocity-iot/ui-sdk/factories`.
6. **`mock.reset()` in `beforeEach`**: no unique names, no teardown, no cross-test state.

### Review screenshots and the frozen clock

- One `await reviewScreenshot('<plugin>/<view>')` per view the plugin renders (the widget on the dashboard, its config dialog, a page), at the end of the test that shows the view in its typical state. CI takes them on the change and on `main` with `--frozen` and lists the views that differ for the reviewer; no baseline images are committed. Mask what differs between two runs of the same code: `mask: [page.locator('.generated-id')]`.
- `--frozen` holds the page's `Date` still. Code that waits for `Date` to move never continues: RxJS `debounceTime` compares two `Date.now()` readings, so a debounced search or filter field never searches, and the cockpit shell's navigator never opens (`verifyIfNavOpen` debounces). `visitApp` from `./support/fixtures` settles the clock after the page loads; after an in-app action that arms a debounce (a navigation click, typing into a search or filter field), `await settleClock(page)` (a no-op in a normal run, so call it unconditionally). `setTimeout`-based waits (polling, `timer`) are unaffected.
- The suite must pass with and without `--frozen`; verify both before finishing.

### Selector priority

1. The plugin's own `data-cy` attributes (add them to the component under test if missing — that is part of the task).
2. The Web SDK's `data-cy` hooks through the generated `test/playwright/selectors.ts` (`import { selectors } from './selectors'`): `selectors.dataGrid.header('Name')`, `selectors.dataGrid.reloadBtn`, `selectors.alertOutlet.message`, `selectors.confirmModal.ok`, … Find a key with `grep -n "<word>" test/playwright/selectors.ts`. Never paste a Web SDK `data-cy` value into a spec; the file is regenerated with `pnpm run e2e:selectors` after a Web SDK bump and a removed key becomes a type error. Component tags without a hook: `c8y-ui-empty-state`, `.modal-content`.
3. `getByRole`, `aria-label`, or `span[title="…"]` for tab items (`c8y-tabs-outlet span[title="<Tab label>"]`).
4. Text only through `filter({ hasText })`, anchored (`/^\s*name\s*$/`) when names share a prefix: locators are strict, two matches fail the step. The suite runs with `language: 'en'`.

**Widget gotchas** (Web SDK 1024.x / ngx-bootstrap):
- A host element can have no box (`c8y-data-grid`, `c8y-header-bar` use `display: contents`): `toBeVisible` on the tag fails although the page shows it. Assert on rendered content inside it.
- ngx-bootstrap tooltips open on `mouseover`: `locator.hover()`, then assert `page.locator('body .tooltip')` (rendered at body level, outside any scoped locator).
- A hover-only button: `row.hover()`, then click. An element under an overlay: `locator.dispatchEvent('click')` (`force` still clicks at the position, where the overlay takes it).
- Styled checkboxes (`c8y-checkbox`, the native input has no box): `check()` fails with "outside of the viewport". `locator.dispatchEvent('click')`, then `expect(input).toBeChecked({ checked })`.
- Visually hidden radios (`sr-only`): `check()` does nothing; click the wrapping label.
- After the widget config modal saves, its preview copy of the widget lingers while the modal closes, so `page.locator('<widget>')` resolves to two elements. Scope post-save checks to `c8y-widgets-dashboard <widget>` and preview checks to `c8y-widget-config <widget>`. A `filter({ has })` locator is relative to the filtered element: do not repeat the ancestor in it.
- CDK drag-and-drop: `page.mouse.move/down/up` in small steps; `dragTo` is too fast for `cdkDrag`.
- Keyboard: `locator.press('Shift+ArrowRight')`, `page.keyboard.press(…)` send real key events.

## Phase 3 — Verify in a loop until green

1. **Run the plugin's suite headlessly**, from the repo root, as one blocking call (the dev server needs about two minutes):
   ```bash
   pnpm run e2e:mock <plugin> --spec=<spec-name-filter> 2>&1 | grep -v "webpack\|ECONNRESET\|^<e>\|^\s*$" | tail -80
   ```
   `--spec` is Playwright's file filter (a regex for several: `"--spec=plugin-(a|b)"`); test titles go through `-g "<title regex>"`; `--headed` watches it, `--open` is UI mode.
2. **On failure, read the trace, not just the error.** Every failed test leaves `test/playwright-results/<test>/` with `trace.zip` (DOM snapshots, network, console: `pnpm -C test exec playwright show-trace <zip>`) and `test-failed-1.png`. `mock.requests()` returns what the app sent to the mock; the gap report (`E2E_MOCK_GAPS=<file>`) lists requests the mock does not emulate.
3. **Failure signature table:**

   | Symptom | Likely cause |
   |---|---|
   | `waitForRequest` times out | The URL predicate does not match what the service sends (check the source), or it was registered after the click |
   | Anchor selector never appears after `visitApp` | Plugin failed to load (module-federation error in the console of the trace), remotes not in the query string, or the dev server on that port is another checkout's |
   | `strict mode violation: resolved to N elements` | Anchor the text filter or narrow the locator; never `.first()` on something that must be unique |
   | `toBeVisible` fails with a 0×0 box | `display: contents` host — assert on content inside |
   | A `PUT` of `c8y_Availability` or similar derived data does not show | The mock derives it like a tenant: load a world with the underlying data (`availability.ts`) |
   | A request answers 404 / 405 on the mock but works on a tenant | A mock gap: check the gap report, `test.fixme` with the reason and report it, do not rewrite the app |
   | The app reloads mid-test (`[webpack-dev-server] App updated. Reloading…`), or `ChunkLoadError` | Something edited `packages/` while the suite ran: rerun once the build settled |
   | The plugin behaves like an older version although the dev server compiled the new code | The dev port was already taken: `lsof -nP -iTCP:<port> -sTCP:LISTEN`, pick free `E2E_DEV_PORT` / `E2E_MOCK_PORT` |
   | Tests pass alone, fail in the suite | State left on the mock or in the page: `mock.reset()` in `beforeEach`, no module-level mutable state besides ids read in `beforeAll` |
   | Passes normally, times out with `--frozen` after a click or typing | The app debounces and `Date` stands still: `await settleClock(page)` after the action |
   | `reviewScreenshot` differs between two frozen runs of the same code | Something in the view is random or live (an id, a spinner, a relative time with a running timer): mask it, or take the screenshot once the state settles (`settle`) |

4. Fix, rerun, repeat. When green, **run the plugin's whole suite once** (without `--spec`) to catch cross-spec interference, and **once with `--frozen`**: a test that hangs there waits on `Date` (add `advanceClock`), and `test/review-screenshots/<plugin>/` must hold every view the spec photographs.
5. Run `pnpm -C test exec tsc -p tsconfig.json`: the specs must type-check.
6. Report results with the pass/fail counts from the summary — never claim success without a green run.

## Security constraints

- The mock's login is a throwaway (`mock-password`); still, never print tokens, `Authorization` headers or any `.env` value, and never commit `test/playwright-results/` or `test/playwright-report/` (git-ignored).
- Never point the suite at a real tenant: the fixtures reset and rewrite the world they are given.

## Definition of done

- [ ] Preflight passed (workspace installed, browser installed, world present, ports free)
- [ ] Every request assertion cross-checked against the current service source
- [ ] Selectors taken from the live DOM (or its fallbacks), not from memory
- [ ] State arranged on the mock; `page.route` only for failures and in-flight changes
- [ ] Success and failure paths covered for each user action
- [ ] Changed spec green in a headless run; the plugin's suite green once, and once with `--frozen`; `tsc` clean
- [ ] Every view the spec shows has a `reviewScreenshot('<plugin>/<view>')`; debounced actions are followed by `settleClock(page)`
- [ ] Run output deleted, nothing from it in summaries, commits or PRs
- [ ] New failure signatures or widget gotchas discovered during this run added to this skill file
