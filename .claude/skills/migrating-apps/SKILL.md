---
name: migrating-apps
description: >-
  Migrate a Cumulocity Web SDK app or plugin to another Web SDK version (upgrade, LTS to LTS, to cd, Angular major
  bump): breaking-changes report (ui-breaking-changes-cli via `c8y-ui migrate report`), a reference app generated at
  the target to diff the config files against, the version bump of every @c8y package together with the shells, the
  source fixes, and verification on the mock inside the target version's shell builds. Use for "migrate", "upgrade",
  "update the Web SDK", "breaking changes", "bump @c8y".
---

# Migrating a Web SDK app

Adapted from `migration` (cumulocity-skills-community, Apache-2.0). The harness: `c8y-ui migrate report | reference |
bump` plus the mock, which runs the migrated app inside the **target** version's cockpit/administration builds — the
same check a tenant on that version would give, before any tenant is involved.

## 1. Pick the target

```sh
pnpm exec c8y-ui versions                # newest installable version (≥ 7 days, with shell builds) up to the latest major
pnpm exec c8y-ui versions --major 1025   # … of another major
```

The target must be installable under the release-age rule and have shell builds, or neither `pnpm install` nor the
mock can use it. The report (step 2) also accepts aliases (`y2027-lts`, `1024.21`, `cd`); bump and reference need
the exact version.

## 2. Report the breaking changes

```sh
pnpm exec c8y-ui migrate report --to <target>                 # → migration/<from>-to-<target>.md
pnpm exec c8y-ui migrate report --to <target> --format json --breaking-only
pnpm exec c8y-ui migrate report --to <target> --grep          # with grep patterns for affected symbols
```

`<from>` is `c8y-ui.json` → `version`. Go through every item: severity (`BREAKING` 🔴 must be resolved, `NOTABLE`
🟡 checked), category (`angular`, `websdk-ui`, `rest-api`, `security`, `migration`), and find the affected code
(`grep -rn '<symbol>' src`). Keep a list of the BREAKING items that hit the app; it is the work list for step 5.
The report ends with *data-cy selectors*: the lines of the specs (`playwright/`, `cypress/`, `e2e/`) that use a
selector the target no longer has. Add them to the work list; the new name is in the diff of `selectors.ts` after the
bump (step 4), or in the target's shell on the mock. A key that only changed name is listed with its new key. *Not
compared* says why the section is empty (the installed version is not `--from`, or npm could not be read).

REST API items matter for the mock too: if the emulator answers differently from the target platform, report it.

## 3. Generate a reference app at the target

```sh
pnpm exec c8y-ui migrate reference --to <target>   # ng new + ng add at the target, same template, in the cache
```

A target younger than the release age falls back to the newest installable version of its major (logged; it
generates the same files). Outside a project — a workspace of several apps — `report` reads the start version from the
nearest `package.json` with `@c8y/ngx-components`, and `reference` takes `--template plugin|application` and `--shell`.

It prints a `git diff --no-index` line per file that the Web SDK generates (`package.json`, `angular.json`,
`tsconfig*.json`, `cumulocity.config.ts`, `src/main.ts`, `src/bootstrap.ts`, `src/app/app.config.ts`,
`src/polyfills.ts`, `src/index.html`). Take over what the target generates differently — builder options, styles,
providers, bootstrap signature, compiler options — and keep the app's own content (name, exports, routes, branding).
Cross-check each change against the report.

To a target with TypeScript 6 (Web SDK 1025 and later), Cypress 14 needs two entries, or `pnpm e2e` fails with
TS5107 or TS5101: `"ts-node": { "ignoreDiagnostics": [5107] }` at the top level of `tsconfig.json`, and
`"ignoreDeprecations": "6.0"` in the `compilerOptions` of `cypress/tsconfig.json`. Add them after the bump: TypeScript 5
rejects the second.

## 4. Bump the versions

```sh
pnpm exec c8y-ui migrate bump --to <target>
```

Sets every `@c8y/*` package and `c8y-ui.json` → `version` (the shells) to the target and installs. When the target
needs another Angular major (the reference app's `package.json` tells), update Angular with its own migrations:

```sh
pnpm exec ng update @angular/core@<major> @angular/cli@<major>
```

and align `angular-eslint` to the same major (`pnpm add -D angular-eslint@^<major>`). Install errors under the
supply-chain settings are fixed by choosing versions, never by loosening `pnpm-workspace.yaml`.

The bump also writes `playwright/selectors.ts` (`cypress/selectors.ts`) again when the app has it: the file's diff
lists the `data-cy` selectors the target renamed or removed, and the specs' type check (step 5) fails where they
are used.

## 5. Fix the code

For each BREAKING item of step 2, apply the fix (renames, replaced APIs, import paths, removed options), looking the
new API up in the `c8y-web-sdk-knowledge` MCP. After each group of fixes:

```sh
pnpm exec ng build
pnpm lint
pnpm exec tsc -p playwright --noEmit   # the specs (cypress: -p cypress): a renamed selector, a changed fixture
```

until all are clean. Neither `ng build` nor the test runners type-check the specs: without the last step a removed
selector shows up only as a locator timeout in `pnpm e2e`.

## 6. Verify on the mock, inside the target's shells

```sh
pnpm world:check     # widget configs still valid for the target's widgets
pnpm e2e             # downloads the target's shell builds, records their checksums, runs the suite inside them
pnpm dev:vite        # look at the changed areas
```

A plugin that builds but fails to load in the target shell shows up here (module federation, shared versions,
removed hooks). Fix, rerun.

## 7. Review

Run `reviewing-code-quality` over the changed files; leftovers of the old version (deprecated hooks, `*ngIf`,
removed modules) are typical findings.

## Checklist

- [ ] Target installable and with shell builds (`c8y-ui versions`)
- [ ] Report saved in `migration/`, BREAKING items that hit the app listed
- [ ] Reference app diffed, generated config taken over
- [ ] `c8y-ui migrate bump` done; Angular updated with `ng update` if the major changed
- [ ] Specs fixed for the selectors that changed (the diff of `selectors.ts` after the bump)
- [ ] Every listed BREAKING item fixed
- [ ] `ng build`, `pnpm lint`, `pnpm world:check` clean
- [ ] `pnpm e2e` green inside the target's shells
- [ ] Code review done, HIGH findings fixed

## Rules

- Never edit `@c8y/*` versions or `c8y-ui.json` → `version` by hand: `c8y-ui migrate bump` keeps them and the shells together.
- Never loosen the pnpm supply-chain settings to get an install through.
- A migration is done when the e2e suite is green in the target's shells, not when it compiles.
