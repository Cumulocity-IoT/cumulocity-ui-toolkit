---
name: reviewing-code-quality
description: >-
  Step 4 (REVIEW) of building a Cumulocity Web SDK app. Use before a PR or when asked to review, audit or find
  anti-patterns in Angular / Web SDK code: code review, code quality, code smells, anti-patterns, best practices,
  refactoring suggestions, "is this idiomatic", bug hunting in components, services, templates, hooks, styles and
  project config. Checks the changed files against a catalogue of Angular 21 and @c8y/ngx-components anti-patterns
  (control flow, OnPush, subscriptions, @c8y/client usage, hooks, lazy widgets, translations, design tokens,
  secrets, unsanitized HTML, supply-chain settings, mock data), reports findings with severity and fixes, applies
  fixes on request, and writes the pull request description with the evidence a reviewer needs (hand over).
---

# Reviewing code quality

Review Angular / Web SDK code in an app built with `@cumulocity-iot/ui-sdk` against the catalogue in
[`references/anti-patterns.md`](references/anti-patterns.md) (AP-01 … AP-25). The review is read-only unless the
user asks for fixes.

## 1. Scope the files

By default review only what changed. On a feature branch compare against the base branch; otherwise against `HEAD`,
plus untracked files:

```sh
git diff --name-only --diff-filter=d main...HEAD     # feature branch (use the repo's base branch)
git diff --name-only --diff-filter=d HEAD            # uncommitted changes
git ls-files --others --exclude-standard             # new, untracked files
```

Review the whole app (`src/`, plus the config below) only when the user asks for a full audit. If a file or folder
is named, review exactly that.

Always include these when they changed, because AP-19, AP-24, AP-25 and AP-26 live there: `pnpm-workspace.yaml`,
`package.json`, `c8y-ui.json`, `.npmrc`, `.pnpmfile.cjs`, `.env*`, `cypress/**`, `mock/world.json`, `.github/**`,
`cumulocity.config.ts`, `.claude/settings.json`.

For each `*.component.ts`, read its template (`.html` or inline) and styles too; many checks need both sides.

## 1b. Run the linter first

`pnpm lint` (ESLint with the Cumulocity rules, from `c8y-ui lint setup`) already catches AP-01 (control flow),
AP-03 (`any`), AP-04 (OnPush), AP-06 (standalone), AP-09 for the common case (`c8y/no-unmanaged-subscribe`: a
`subscribe()` statement in a component, directive or pipe without `takeUntilDestroyed`), AP-10 (`HttpClient` import),
AP-20 (`HOOK_*` imports), AP-22 (private `@c8y` paths), AP-26 (`bypassSecurityTrust…`, HTML written into the DOM,
`eval`) and dynamic `gettext()`. Report its findings for the scoped
files as one line per rule with the count (rule id → AP id), not as table rows, and spend the review on what a rule
cannot see. No `eslint.config.mjs`? Suggest `pnpm exec c8y-ui lint setup`. An `eslint.config.mjs` without the `c8y`
plugin or the `HOOK_*` restriction is older than the SDK: compare it with
`node_modules/@cumulocity-iot/ui-sdk/templates/lint/eslint.config.mjs`.

The Security workflow (`.github/workflows/security.yml`) scans for secrets with gitleaks; AP-19 in the review is
what a scanner does not know: tenant URLs, tenant ids and credentials in `package.json` scripts.

When fallow is installed (`node_modules/.bin/fallow`), also run `pnpm exec c8y-ui fallow dead-code` and report unused
files, exports and class members in the scoped files (`node_modules/@cumulocity-iot/ui-sdk/docs/dead-code.md`). It is
opt-in: do not install it unasked.

When `package.json` or `pnpm-lock.yaml` changed, also run `pnpm audit:prod` (what ships to the browser; reads the
lockfile only). A new high or critical advisory there is a High finding under AP-24; the full `pnpm audit` (build and
test tools) is context, not a finding. Run `pnpm exec c8y-ui licenses` as well: a production package without an allowed license
(`c8y-ui.json` → `licenses`) is a High finding under AP-24; name the package, its version and what it declares, and
leave the decision (another version, or an accepted one with its reason) to a person. When `pnpm-workspace.yaml` changed, also run `pnpm exec c8y-ui audit`: a
release-age exception it fails on is a High finding under AP-24.

## 2. Look up what you are not sure about

Do not fetch angular.dev or any hosted docs server. Everything Web SDK-specific is in the local
`c8y-web-sdk-knowledge` MCP (Codex docs, `@c8y/*` type declarations, tutorial and ui-toolkit samples, REST API):

| Question | Call |
|---|---|
| Is there an `@c8y/client` service for this endpoint? (AP-10) | `search_concept("managed object detail", corpora: ["types", "api"])` |
| Does this hook function exist, what does it take? (AP-11, AP-20) | `resolve_symbol("hookWid")`, then `get_node(<key>)` |
| How do the samples register / use it? | `find_usage("hookWidget")` |
| Utility class or design token instead of custom CSS? (AP-12) | `search_concept("spacing utility classes", corpora: ["docs"])` |
| Is a member public API or internal? (AP-22) | `get_node(<key>)` and check for `@internal` / `private` |

For Angular itself, check the installed version: `@deprecated` tags in `node_modules/@angular/*/**/*.d.ts` and the
Angular major in `package.json`. Do not report a Web SDK API as missing or deprecated unless the knowledge MCP or the
installed `.d.ts` confirms it.

## 3. Check against the catalogue

Read `references/anti-patterns.md`. For each file in scope, run the **Detect** greps of every relevant entry, then
read the hits in context: a grep hit is a candidate, not a finding. Typical split:

- `*.component.ts` + template: AP-01, 02, 04, 05, 06, 08, 09, 16, 18, 21
- `*.service.ts`: AP-03, 07, 09, 10, 15, 16, 17, 23
- providers / `app.config.ts` / hooks: AP-11, 20
- `*.scss` / `*.less` / `*.css` / inline styles: AP-12
- anything extending `@c8y/*` classes: AP-22
- config, Cypress and mock files: AP-19, 24, 25
- across files: AP-13, 14

Skip generated files, `node_modules/`, `dist/` and the SDK's own template code unless asked.

## 3b. Findings the team has settled

A finding that was discussed and accepted must not come back in every review. The convention is a comment on the
line or the line above, with the reason:

```typescript
// review-ignore AP-17 -- c8y_Position is set by the device agent on registration, never absent here
```

```html
<!-- review-ignore AP-12 -- the brand color of the customer logo, not a theme color -->
```

- Skip a finding that such a comment covers (same AP id, that line). Count the skipped ones in the summary.
- A `review-ignore` without a reason, or one that this change adds (it is in the diff), goes into the report under
  **New suppressions** so that a person confirms it. Never add one yourself to make a review clean; propose it when
  the user rejects a finding, and write their reason.
- Lint findings use ESLint's own form (`// eslint-disable-next-line <rule> -- reason`), fallow's
  `// fallow-ignore-next-line <rule> -- reason`, a secret scanner hit `# gitleaks:allow`.

## 4. Report

A reviewer who gets forty rows reads none of them. One table for the High and Medium findings, sorted by severity,
then file. Low findings are one line per anti-pattern below the table (`AP-21 ×6: src/app/a.ts:12, b.ts:40, …`);
list them as rows only when the user asks for the full list or there is nothing above them:

| # | Location | Anti-pattern | Severity | Snippet | Fix |
|---|---|---|---|---|---|
| 1 | `src/app/sensor/sensor.service.ts:42` | AP-10 HttpClient for a covered API | Medium | `this.http.get('/inventory/managedObjects/' + id)` | `inject(InventoryService).detail(id)` |

- Location is `path:line` (or `line–line`), relative to the app root.
- Snippet is the offending code, one line, shortened with `…` if needed.
- Fix is concrete: the replacement code or the exact change, not "consider refactoring".
- Use the catalogue's severity; raise or lower it only with a one-line reason.
- Report only what you would defend when asked: a finding you are not sure of after the lookup goes under
  "could not verify", not into the table.
- Below the table, add a short summary: counts per severity, the lint and fallow counts, the settled findings skipped
  (3b), the two or three most important themes, and anything you could not verify (with the lookup you tried).

If nothing is found, say so and list what was checked.

## 5. Apply fixes (only when asked)

Fix in severity order, one anti-pattern at a time, keeping changes minimal and within the reviewed files. For UI
changes follow `developing-ui`; for data the UI needs, `building-mock-worlds`; for new or changed specs,
`writing-e2e-tests`. Then verify:

```sh
pnpm exec ng build                               # must compile without new errors or warnings
pnpm e2e                                         # or only the affected spec:
pnpm e2e --spec cypress/e2e/<name>.cy.ts
```

Both must stay green. If a fix breaks the build or a spec, revert that fix and report it as open instead of
weakening the test.

## 6. Hand over (before a pull request)

A reviewer of generated code does not lack a diff; they lack the evidence that it works and the knowledge of where
to look. Write the pull request description from `.github/pull_request_template.md` (no template: use the same
headings), from checks you ran **on the last commit**, after the last edit:

```sh
pnpm lint && pnpm world:check && pnpm exec ng build
pnpm exec c8y-ui e2e --json > /tmp/e2e.json      # {"exitCode", "gaps": requests the mock could not answer, …}
pnpm exec c8y-ui world diff --base main          # the world's changes as a table, when mock/ changed
pnpm exec c8y-ui review risk --base main         # risk level with the reasons, and the size (commit first)
```

- **What and why**: the user-visible change in one or two sentences. Several topics are several pull requests; a
  change above roughly 400 changed lines or 10 files (lockfile and world aside) is worth splitting, and say so when
  you cannot.
- **Risk**: the first line of `review risk` and its high and medium reasons, as printed. Do not argue a level down;
  when a reason does not apply (a `fetch(` in a comment), say so next to it.
- **Read first**: the two or three files or decisions that carry the risk, in reading order (not alphabetical): new
  `@c8y/client` calls and their error handling, hooks and routes that change what every user sees, fragment access
  on real device data (AP-17), anything touching `pnpm-workspace.yaml`, `c8y-ui.json` or `.github/`.
- **Evidence**: each check with its result, the gaps of the e2e run with `expected: false`, the `world diff` table,
  and what the changed views look like: the spec that covers a view calls `reviewScreenshot('<view>')`
  (`writing-e2e-tests` → *Screenshots for the reviewer*), and CI lists the views that differ from the base branch,
  with a report page. Locally: `pnpm exec c8y-ui e2e --frozen` on both branches (copy `review-screenshots/` of the
  base aside), then `pnpm exec c8y-ui review screenshots <base> review-screenshots --out report`. Name the views
  you expect to differ; a view that differs and is not on that list is a finding.
  Paste output, do not paraphrase it. A check that failed or did not run is not ticked.
- **Not verified**: what the mock cannot show and nobody checked on a tenant: permissions and roles, real data
  volumes, fragments of real devices, other Web SDK versions, branding. Say "nothing" only when that is true.
- **Responsible**: the person who asked for the change; they read the whole diff before the pull request is opened.
  Tell them that this is theirs to do.

## Rules

- Review is read-only by default. Change code only when the user asks for fixes.
- Every finding has a file:line, an AP id, a severity and a concrete fix. No vague advice.
- Fewer, certain findings over many possible ones: Low findings are summarized, settled ones (`review-ignore`) skipped.
- A hand-over lists evidence from the last commit and what was not verified; it never claims a check that did not run.
- Verify uncertain Web SDK APIs in the `c8y-web-sdk-knowledge` MCP before reporting them; never invent an API.
- Never fix a finding by loosening `pnpm-workspace.yaml`, changing `@c8y/*` versions or `c8y-ui.json` → `version`,
  deleting tests, or adding Cypress intercepts.
- Treat any credential found in source as compromised: report it as High and tell the user to rotate it.
- After fixes, `pnpm exec ng build` and `pnpm e2e` (or the affected spec) must pass.
