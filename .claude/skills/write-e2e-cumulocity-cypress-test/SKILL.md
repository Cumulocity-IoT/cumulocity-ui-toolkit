---
name: write-e2e-cumulocity-cypress-test
description: Write, update, and verify end-to-end Cypress tests for Cumulocity UI plugins using the cumulocity-cypress package. Use when asked to create or fix e2e tests for a Cumulocity feature or bug, or when e2e tests fail in CI. Covers backend request discovery, intercept/wait patterns, and an autonomous run-analyze-fix verification loop.
license: Apache-2.0
metadata:
  author: Christian Guether
  version: "2.0"
---

# Write and verify e2e Cypress tests for Cumulocity

You are writing deterministic Cypress test code (no `cy.prompt()`), validating it yourself in a loop until it passes. A test is not done until you have run it headlessly and seen it green.

**Workflow at a glance:**

0. **Preflight** — verify `.env`, dev server, tenant/base-URL match, device ID.
1. **Discover** — walk the flow in a live browser (selectors, requests, response shapes), then confirm the backend contract in the Angular service source.
2. **Write** — standard suite skeleton, intercept every relevant request before visiting, assert via stable selectors.
3. **Verify** — run headless in a loop, diagnose from the request trace, fix, repeat; full suite once when green.
4. **Finish** — delete run logs, report pass/fail counts, fold new lessons back into this skill.

This skill is project-agnostic. Placeholders in angle brackets (`<feature>`, `<Tab label>`, …) must be replaced with names discovered in the repo you are working in — never invent them.

## Phase 0 — Preflight: verify the environment before writing anything

Run these checks first. Every minute spent here saves a failed-run iteration later.

1. **Learn the project's env contract.** Read `cypress.config.ts` (and `cypress/support/e2e.ts`) to see which `.env`/environment keys the project reads and how they map into Cypress. Typical keys: `C8Y_TENANT`, `C8Y_BASEURL`, `C8Y_USERNAME`, `C8Y_PASSWORD`, `C8Y_SHELL_TARGET`, plus project-specific ones for the dev-server URL and a test device ID. Key names in `.env` often differ from what specs read via `Cypress.env(...)` — the config file is the authority on that mapping.

   Verify `.env` exists and contains the required keys. Check key names only (`cut -d= -f1 .env`) — never print values. `.env` values are **not** exported to your shell; to use one in a command, extract it into a variable first:
   ```bash
   CYURL=$(grep '^<DEV_SERVER_URL_KEY>=' .env | cut -d= -f2- | tr -d '\r')
   ```
2. **Dev server is up**: `curl -s -o /dev/null -w "%{http_code}" "$CYURL/apps/<C8Y_SHELL_TARGET value>/index.html"` must return 200. If not, ask the user to start it (usually `npm run start`); do not start it yourself unless asked.
3. **Tenant ID matches the base URL**. This is a frequent silent breaker: `.env` files get copied between environments. Verify with the public endpoint:
   ```bash
   curl -s "$C8Y_BASEURL/tenant/loginOptions"
   ```
   The `self` links reveal the real tenant ID (e.g. `https://t12345.…`). If it differs from `C8Y_TENANT`, fix `.env`. Symptom of a mismatch: login fails with HTTP 400 `"A tenant is required in context!"`.
4. **Device ID exists** (only if the test needs a device context):
   ```bash
   curl -s -o /dev/null -w "%{http_code}" -u "$C8Y_USERNAME:$C8Y_PASSWORD" "$C8Y_BASEURL/inventory/managedObjects/<device id>"
   ```
   On 404, find a real one: `GET /inventory/managedObjects?fragmentType=c8y_IsDevice&pageSize=3` and update `.env`.
5. **Dependencies are pre-installed** (`cumulocity-cypress`, and ideally `cypress-terminal-report` for request traces). Do not install anything new without asking.

## Phase 1 — Discover the feature: browser first, then source

### 1a. Walk the flow live in the browser

If a logged-in browser session against the dev server is available (Chrome DevTools MCP or Playwright MCP), **always start there** — before reading `node_modules` or querying any SDK knowledge source. Navigate the actual user flow you are about to test and record, in one pass:

- **The rendered DOM**: enumerate `data-cy` attributes, component tags, `title`/`aria-label` hooks on every element the test will touch (a small `evaluate_script` that maps buttons/cells/tabs to their attributes does this in seconds). This yields the real selectors — including the built-in hooks of `@c8y/ngx-components` widgets — with zero guessing.
- **The network traffic**: which requests fire on route load vs. on user action, their order, methods, and query params. This confirms the contract you derive from source in 1b and reveals side calls (permission lookups, `currentTenant`, option fetches) the source reading might miss.
- **The real response shapes**: copy a live response as the template for mock bodies instead of reconstructing them from interfaces.

Do **not** try to discover widget internals by grepping minified `@c8y/ngx-components` bundles — it wastes time and fails. Fallback order when no live browser is available: an existing passing spec in the repo → the `c8y-web-sdk-knowledge` MCP (if configured) for component APIs and hooks → run the test once and read the DOM from the failure screenshot/trace.

### 1b. Confirm the backend contract from the source code

**Never guess intercept URLs.** The single most common e2e regression is an intercept pointing at a renamed or wrong endpoint — the test then times out with "No request ever occurred" while the real request 404s unmocked. The browser shows what fires *today*; the source is authoritative for what the intercept must match (and for branches the live environment cannot reach, e.g. a management-tenant-only code path).

Before writing a test for a component:

1. Read the Angular service(s) the component injects (`*.service.ts`). Collect every `BASE_URL`/endpoint constant and every `fetchClient.fetch(...)`, `measurementService.*`, `eventService.*`, `tenantService.*` call.
2. For each user flow the test covers, list the requests it triggers, grouped by trigger:
   - **on init** (`ngOnInit`): usually GETs that populate forms/grids — these fire during page load, so their intercepts must be registered **before** `cy.visit`/the shell visit command.
   - **on action** (save/delete/confirm): POST/PUT/DELETE — intercept and assert the request body.
   - **side calls** the component makes that could interfere (validity checks, audit events, permission lookups).
3. Prefer importing URL constants from the app code into the spec when they are exported (compile-time protection against renames). If they are not exported, consider exporting them as part of your change.

## Phase 2 — Write the test

### File location and naming

- New AI-written specs go to `cypress/e2e/` (or `cypress/e2e/ai-generated/` if that folder convention exists in the repo). TypeScript, `<feature>.cy.ts`.
- One `describe` per feature area; `it` names state observable behavior ("Should show error alert when updating the configuration fails").

### Mandatory suite skeleton

```typescript
/// <reference types="cypress" />

describe('<Feature name>', () => {
  // only if the test needs a device context (check cypress.config.ts for the exact env key):
  const deviceId = Cypress.env('C8Y_DEVICE_ID');

  before(() => {
    // 'administration' | 'devicemanagement' | 'cockpit' — pick the shell hosting the plugin
    Cypress.env('C8Y_SHELL_TARGET', 'administration');
    Cypress.session.clearAllSavedSessions();
  });

  beforeEach(() => {
    // cumulocity-cypress: OAuth login via cy.request + session caching. NEVER hand-roll login.
    cy.getAuth().login().disableGainsight();
  });

  it('...', () => {
    // 1. intercepts  2. visit  3. interact  4. wait on aliases  5. assert UI
  });
});
```

### Navigation

Check `cypress/support/commands.ts` for an existing project-local shell-visit command before writing navigation code — plugin repos usually define one. The common pattern is a command like `visitShellAndWaitForSelector(url, language, selector)` that prefixes `/apps/<C8Y_SHELL_TARGET>/index.html#/`, appends the plugin `remotes` query string (often from a `C8Y_SHELL_EXTENSION` env var), calls `cy.setLanguage(language)`, visits, and waits for an anchor selector to be visible. If the project has no such command, add one following that pattern rather than inlining `cy.visit` calls in every test.

```typescript
// Shell root (administration/cockpit):
cy.visitShellAndWaitForSelector('', 'en', '#navigator');
// Device context:
cy.visitShellAndWaitForSelector(`device/${deviceId}`, 'en', 'c8y-tabs-outlet');
```

Have **one** test navigate by clicking (navigator entry, tab), so `hookNavigator`/`hookTab` registration is covered:

```typescript
cy.get('#navigator button[data-cy="<Navigator entry label>"]').click();
cy.get('c8y-tabs-outlet span[title="<Tab label>"]').click();
```

The remaining tests may deep-link to the route for speed — pass the plugin component's selector as the anchor:

```typescript
cy.visitShellAndWaitForSelector('<feature/route>', 'en', '<plugin-component-selector>');
```

### Intercept and wait — the rules

1. **Register every intercept before the visit.** Init-time requests fire during page load; a late intercept never matches.
2. **Anything not intercepted hits the real backend** through the dev proxy. All mutating requests (POST/PUT/DELETE) the flow triggers **must** be intercepted — a test must never write to the real tenant. Read-only GETs may pass through, but intercept the ones your assertions depend on.
3. **Exact paths from Phase 1b**, glob-prefixed: `'**/service/<microservice>/<path>'`. Add a trailing `*` only when the app appends query params (`'**/measurement/measurements*'`). Globs are anchored: `**/x/config` does **not** match `/x/config/details` — mock each endpoint separately.
4. **One alias per route+method**, named after intent: `getConfiguration`, `updateConfigurationFail`.
5. **`cy.wait('@alias')` before asserting dependent UI**, and assert outgoing payloads on it:
   ```typescript
   cy.wait('@updateConfiguration')
     .its('request.body')
     .should('deep.equal', { name: testValue });
   ```
6. **Test failure paths too**: same intercept with `statusCode: 500` and assert the error UI (e.g. `c8y-alert-outlet div[data-cy="c8y-alert--message"].alert-danger`).
7. Mock response bodies must match the TypeScript interfaces the service parses — copy the shape from a live response (Phase 1a) or the model files, not from memory.
8. **Steer app branches by mutating real responses** with `req.continue((res) => …)` instead of replacing the whole body — e.g. fake the management tenant or pin the tenant domain while keeping everything else real:
   ```typescript
   cy.intercept('GET', '**/tenant/currentTenant*', (req) => {
     req.continue((res) => {
       res.body.name = 'management';
       res.body.customProperties = {
         ...(res.body.customProperties || {}),
         gainsightEnabled: false, // see rule 9
       };
       res.send();
     });
   });
   ```
9. **`disableGainsight()` shadowing**: cumulocity-cypress disables Gainsight via its own intercept on `/tenant/currentTenant*`. Cypress matches the most recently registered intercept first, so any spec intercept on that route **shadows it** — the test then fails with `Intercepted Gainsight API key call, but Gainsight should have been disabled`. Whenever you intercept `currentTenant`, re-set `customProperties.gainsightEnabled = false` in your handler (as above).

### Selector priority

1. `data-cy` attributes (add them to the component under test if missing — that is part of the task).
2. Cumulocity component tags: `c8y-data-grid`, `c8y-ui-empty-state`, `c8y-alert-outlet`, `.modal-content`, and built-in `data-cy` hooks. Known `c8y-data-grid` hooks: `button[data-cy="data-grid--reload-btn"]`, `td[data-cy="data-grid--<Column Header>"]` (uses the display header, e.g. `data-grid--Last Updated`), `c8y-data-grid--edit-button-in-row`, `c8y-data-grid--remove-button-in-row`, `c8y-confirm-modal--ok`.
3. `aria-label` / `role`, or `span[title="…"]` for tab items (`c8y-tabs-outlet span[title="<Tab label>"]`).
4. Never: positional selectors, generated class names, text-only matching for critical steps (text is locale-dependent — the suite runs with `language: 'en'`).

All selectors should come from the Phase 1a live-DOM walk (or its fallbacks) — never from memory or from grepping minified bundles.

**Widget gotchas** (verified against ngx-components 1023.x / ngx-bootstrap):
- `c8y-data-grid` renders with `display: contents` → 0×0 size, so `.should('be.visible')` on the tag itself **always fails**. Assert visibility on rendered content inside it (a `td[data-cy=…]` cell) instead.
- ngx-bootstrap tooltips open on `mouseover` (not `mouseenter`): `.trigger('mouseover')`, then assert `cy.get('body .tooltip')` (tooltips with `container="body"` render at the body level, outside any `.within()` scope).

### Useful cumulocity-cypress helpers

`cy.getAuth()`, `.login()`, `.disableGainsight()`, `cy.setLanguage('en')`, `cy.compareDates(displayedText, isoString)` for locale-formatted dates in grids.

## Phase 3 — Verify in a loop until green

1. **Run only the spec you changed**, headless, capturing **full** output to a file — never pipe through `head`/`tail`, truncation destroys the diagnosis:
   ```bash
   npx cypress run --browser chrome --spec cypress/e2e/<spec>.cy.ts > /path/to/scratch/run.log 2>&1
   ```
   Run it in the background if it takes minutes; a shell-based spec typically takes 1–3 min.
2. **On failure, read the trace, not just the error.** With `cypress-terminal-report` installed, the log prints every request and command:
   - `cy:fetch` / `cy:xhr` lines = requests the app actually made. A request matched by one of your intercepts is prefixed with the alias and marked `STUBBED` (e.g. `cy:fetch ➟ (getConfiguration) STUBBED GET …`); a line without that prefix passed through to the real backend.
   - `Matcher: "…"` lines = what your `cy.wait` was waiting for.
   - Compare the two — a mismatch is almost always the bug.
3. **Failure signature table:**

   | Symptom | Likely cause |
   |---|---|
   | `cy.wait() timed out … No request ever occurred` | Intercept URL doesn't match reality (check service code), or intercept registered after the request fired |
   | `before each hook` fails on `cy.request()` to `/tenant/oauth` with 400 `A tenant is required in context!` | `C8Y_TENANT` doesn't belong to `C8Y_BASEURL` — rerun preflight step 3 |
   | Anchor selector never appears after visit | Wrong `C8Y_SHELL_TARGET`, shell app not deployed on tenant, or plugin remotes not in the query string |
   | Element not found inside plugin | Plugin failed to load (check for module-federation errors in the log) or missing `data-cy` |
   | Grid shows data but assertion on time/date fails | Locale formatting — use `cy.compareDates` |
   | `Intercepted Gainsight API key call, but Gainsight should have been disabled` | A spec intercept on `/tenant/currentTenant*` shadowed the `disableGainsight()` intercept — re-set `gainsightEnabled: false` in your handler (intercept rule 9) |
   | `expected '<c8y-…>' to be 'visible'` with `effective width and height of 0 x 0` | The component uses `display: contents` — assert on rendered content inside it |
   | Tooltip/popover never appears after `.trigger('mouseenter')` | ngx-bootstrap listens to `mouseover` — trigger that instead |

4. Fix, rerun the single spec, repeat. When green, **run the full suite once** (the repo's e2e script, or `npx cypress run --browser chrome`) to catch cross-spec interference (shared `C8Y_SHELL_TARGET`, session state).
5. Report results with the pass/fail counts from the summary table — never claim success without a green run.

## Security constraints

- Never print `.env` values, tokens, or `Authorization` headers. When curling with credentials, output status codes only.
- A **failed** login makes Cypress dump the full request body — **including the password** — into the run log. Treat every run log as sensitive: keep them in the scratchpad, delete them when done, never commit them, and never paste their login sections into summaries, commits, or PRs.
- To verify whether a log leaked the password **without printing it**, compare counts only:
  ```bash
  PW=$(grep '^C8Y_PASSWORD=' .env | cut -d= -f2- | tr -d '\r')
  grep -cF -- "$PW" run.log   # 0 = clean
  ```
- If a CI log has leaked a credential this way, tell the user and recommend rotating it.

## Definition of done

- [ ] Preflight passed (server up, tenant verified, device valid if needed)
- [ ] Every intercept URL cross-checked against the current service source
- [ ] Selectors taken from the live DOM (or its fallbacks), not from memory
- [ ] All mutating requests intercepted; request bodies asserted
- [ ] Success and failure paths covered for each user action
- [ ] Changed spec green in a headless run; full suite green once
- [ ] Run logs checked for credential leaks and deleted
- [ ] New failure signatures or widget gotchas discovered during this run added to this skill file
