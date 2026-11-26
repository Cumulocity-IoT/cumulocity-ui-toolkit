# AGENTS.md — Cumulocity UI Toolkit

Guidance for AI agents working in this repository.

---

## Project Overview

This is a **pnpm monorepo** of Angular 21 UI plugins (widgets) for the Cumulocity IoT platform, maintained by the Cumulocity UI Guild. Each plugin is a self-contained Cumulocity package that can be built and deployed independently.

**Tech stack:** Angular 21 · TypeScript 5.9 · pnpm 10 workspaces · Karma + Jasmine (unit) · Playwright (e2e, on the ui-sdk tenant mock) · ESLint · ng-packagr (shared library build) · `@c8y/devkit` (plugin build) · Cumulocity Web SDK 1024.21.x

---

## Repository Layout

```
cumulocity-ui-toolkit/
├── angular.json              # Single Angular workspace – all plugins registered here
├── package.json              # Root scripts and shared dependencies
├── pnpm-workspace.yaml       # Workspace: packages/* + test/
├── .npmrc                    # shamefully-hoist=true
├── karma.conf.js             # Shared Karma config (Jasmine, Chrome, ChromeHeadlessCI)
├── eslint.config.mjs         # Shared flat ESLint config
├── tsconfig.json             # Root TypeScript config with path aliases for shared/
│
├── packages/
│   ├── shared/               # Internal library: components, pipes, services, helpers
│   │   ├── ng-package.json   # ng-packagr config (FESM2022 output)
│   │   ├── tsconfig.json
│   │   ├── tsconfig.spec.json
│   │   └── src/index.ts      # Barrel export – the public API of shared/
│   ├── energy-consumption-widget/
│   ├── events-graph-widget/  # device events as colored state bars on a timeline (echarts)
│   ├── favorites-manager/
│   ├── index-db-cache/
│   ├── kpi-trend-widget/     # one measurement as gauge or tile with a trend sparkline (from the DER Add-on)
│   ├── kpi-widget/
│   ├── layered-map-widget/
│   ├── navigation-and-search/ # asset tree explorer drawer + global asset search (⌘K)
│   ├── operations-widget/
│   ├── release-notes/
│   ├── reminder/
│   ├── smart-views/
│   └── tenant-option-management/
│
├── test/                     # Playwright e2e suite (own pnpm workspace)
│   ├── playwright/           # Specs: <plugin>[-<area>].spec.ts, plus support/ (repo-specific helpers)
│   ├── playwright.config.ts  # One config for every plugin (E2E_PLUGIN picks the specs and the remotes)
│   ├── scripts/              # e2e-mock.mts (mock + dev server + Playwright), pull-world.mts
│   └── c8y-ui.json           # Tenant-mock config (shell, world, ports)
│
└── tools/                    # Node.js build utilities
    ├── generate-scripts.mts  # Auto-generates package.json scripts from angular.json (ESM TS)
    ├── generate-assets.js    # Generates typed assets.ts barrel from asset folders
    ├── convert-locales.js    # Converts locale .po files
    ├── postbuild.js          # Post-build orchestration
    └── build-rename.js       # Renames ZIP archives to include version number
```

---

## Common Commands

All commands run from the **repository root** unless noted.

| Purpose | Command |
|---|---|
| Install dependencies | `pnpm install` |
| Build all plugins | `pnpm run build` |
| Build a single plugin | `pnpm run build:<name>` (e.g. `build:kpi-widget`) |
| Serve a plugin locally | `pnpm run serve:<name>` (requires `C8Y_BASEURL` + `C8Y_SHELL_TARGET` env vars) |
| Develop on the tenant mock with hot reload | `pnpm run dev` (all plugins) or `pnpm run dev <folder> …`; open the printed URL (router on `DEV_PORT`, default 4200; mock on `DEV_MOCK_PORT`, default 8111). `tools/dev.mts` runs `c8y-ui dev --apps` of the ui-sdk; each plugin's `vite.config.ts` is `c8yVite({ config })` — no local Vite configuration beyond that. Dev only: builds and e2e stay on the devkit. |
| Run all unit tests | `pnpm test` |
| Run unit tests for one plugin (CI) | `pnpm run test:<name>` (e.g. `test:favorites-manager`) |
| Run unit tests for one plugin (watch) | `pnpm run test:watch:<name>` |
| Lint | `pnpm run lint` |
| Lint with auto-fix | `pnpm run lint:fix` |
| Install the e2e browser (once) | `pnpm run e2e:install` |
| Run Playwright e2e on the tenant mock (one plugin) | `pnpm run e2e:mock <name>` (`--open` for Playwright's UI mode, `--headed`, `--spec=<filter>`, `--frozen` for reproducible review screenshots) |
| Dead code, duplication, complexity (fallow) | `pnpm exec c8y-ui fallow` (everything) · `pnpm exec c8y-ui fallow audit --base origin/main` (what a change introduces: the PR gate) |
| Regenerate the Web SDK selectors for the specs | `pnpm run e2e:selectors` (after a Web SDK bump; commit `test/playwright/selectors.ts`) |
| Risk and size of a change | `pnpm exec c8y-ui review risk --base origin/main` |
| Regenerate package.json scripts | `pnpm run generate:scripts` |
| Clean dist/ | `pnpm run clean` |

---

## Adding or Modifying a Plugin

1. **Register in `angular.json`** — Add an entry under `"projects"` following the existing pattern (`plugin.<name>`). Include a `test` architect target using `@angular/build:karma`, pointing to `karma.conf.js` and the package's `tsconfig.spec.json`.
2. **Run `pnpm run generate:scripts`** — Auto-generates `build:<name>`, `serve:<name>`, `test:<name>`, and `test:watch:<name>` entries in the root `package.json`. Do **not** hand-edit the generated section (keyed by the `--generated----------` marker).
3. **Add `tsconfig.spec.json`** — Copy from an existing plugin. Extends root `tsconfig.json`; sets `"types": ["jasmine", "node"]`.
4. **Import from shared** — Use the path aliases (`~services/*`, `~helpers/*`, etc.) defined in the root `tsconfig.json`. Never use relative paths that cross package boundaries.
5. **Assets** — Place static assets in `packages/<plugin>/public/` and register that directory in the plugin's `assets` array in `angular.json`. Asset paths there are **workspace-root relative**, so they must include the `packages/<plugin>/` prefix. Assets imported from TypeScript (e.g. `assets/preview.png` via a generated `assets.ts` barrel) are bundled by the build and need no `angular.json` entry — run `pnpm run generate:assets` to regenerate that barrel.

---

## Shared Library (`packages/shared`)

- The public API is defined entirely in `src/index.ts`.
- Built with **ng-packagr** (`ng build shared`). Output goes to `packages/shared/dist/` (FESM2022 format).
- When adding new exports, always add them to `src/index.ts`.
- Unit tests inside `shared/` use Karma + Jasmine via the `shared` Angular project in `angular.json`.

---

## Unit Testing (Karma + Jasmine)

- Test framework: **Jasmine**. Test runner: **Karma** via `@angular/build:karma`.
- Test files: `**/*.spec.ts` inside `packages/`.
- The root `karma.conf.js` is shared by all projects.
- Each package has a `tsconfig.spec.json` with `"types": ["jasmine", "node"]`.
- All 14 Angular projects in `angular.json` (`shared` + 13 plugins) have a `test` architect target.
- Run a single project: `pnpm exec ng test <project> --watch=false --browsers=ChromeHeadlessCI`
- `ChromeHeadlessCI` custom launcher (defined in `karma.conf.js`) adds `--no-sandbox --disable-gpu --disable-dev-shm-usage` — required in CI.
- Test helper for creating Jasmine spies: `packages/shared/src/helpers/auto-mock.helper.ts`.
- There is **no Jest** in this repository. Do not add `jest`, `jest-preset-angular`, or any `jest.*` config files.

---

## E2E Testing (Playwright)

- **When writing, fixing, or verifying e2e tests, follow the project skill `.claude/skills/write-e2e-cumulocity-playwright-test/SKILL.md`** — it defines the mandatory workflow (discover → write → verify-in-a-loop → finish). A test is not done until it has passed a headless run on the mock.
- Detailed suite documentation lives in **`test/AGENTS.md`** (fixtures, support helpers, dashboard helpers, selectors, state on the mock). Read it before writing any spec.
- Located in `test/` (a member of the root pnpm workspace: the root `pnpm install` covers it; `pnpm run e2e:install` once for the Chromium build).
- Specs: `test/playwright/<plugin>[-<area>].spec.ts`. The file name starts with the package folder name: `playwright.config.ts` runs `<plugin>*.spec.ts` for `E2E_PLUGIN`, and the CI workflows derive the plugin list from the spec names.
- One config for all plugins: `test/playwright.config.ts` derives the Module Federation remotes (`C8Y_REMOTES`, shell `C8Y_SHELL`) from the plugin's `cumulocity.config.ts` (`test/playwright/support/remotes.ts`).
- Fixtures come from `@cumulocity-iot/ui-sdk/playwright`: `test` / `expect`, `visitApp`, `mock` (reset, loadWorld, requests), `api` (REST calls straight to the mock as the world's user; the app's own files under `/apps/…` come from the dev server through `page.request`), `reviewScreenshot` and `advanceClock`. Data factories: `@cumulocity-iot/ui-sdk/factories`. `test/playwright/support/` keeps only repo-specific bits (`remotes.ts`, `availability.ts`, `dashboard.ts`, `navigation-and-search.ts`).
- **Web SDK selectors and drivers**: `test/playwright/selectors.ts` is generated from the installed `@c8y/ngx-components` (`pnpm run e2e:selectors`, committed, marked generated in `.gitattributes`): `selectors.dataGrid.header('Name')`, `selectors.alertOutlet.message`, … Never hard-code a Web SDK `data-cy` value in a spec; a plugin's own `data-cy` hooks stay literal. The shell's components are driven through `shell(page)` from `test/playwright/support/dashboard.ts` (`drivers(page, selectors)` of the ui-sdk): `dashboard`, `widgetConfig`, `dataGrid`, `confirmModal`, `alerts`. After a Web SDK bump: regenerate the file, then `pnpm -C test exec tsc -p tsconfig.json` shows every spec that used a removed selector (`pnpm -C test exec c8y-ui migrate report --to <version>` lists them beforehand); CI fails when the file is stale (`c8y-ui selectors --check`).
- **Review screenshots**: every spec photographs the views it shows (`reviewScreenshot('<plugin>/<view>')`). `pnpm run e2e:mock <plugin> --frozen` freezes the mock's clock and the browser's `Date`, so two runs render the same; `e2e-test.yml` compares the change with `main` and lists the views that differ (nothing is committed). Specs import `test` from `test/playwright/support/fixtures.ts` (`visitApp` settles the frozen clock); after an in-app click or typing that arms a debounce, `await settleClock(page)`, or the frozen run never continues.
- **Only the tenant mock, never a real tenant.** `pnpm run e2e:mock <plugin>` runs the suite against the `@cumulocity-iot/ui-sdk` mock — windy-dev world (pulled at runtime into the git-ignored `test/mock/windy-dev.json` via go-c8y-cli) plus the cockpit release of the workspace's current Web SDK version, picked up from the root `package.json` automatically. CI (`e2e-test.yml`) runs this. `shell-compat.yml` runs it daily for every plugin inside the latest cockpit CD release (`E2E_SHELL_VERSION`) and opens a `shell-compat` issue when it fails. Details in `test/AGENTS.md` → Running Tests.
- Failures leave a trace and a screenshot in `test/playwright-results/` (`pnpm -C test exec playwright show-trace <zip>`); CI uploads that folder and the HTML report. The run's summary page lists the requests the mock could not answer (`E2E_MOCK_GAPS`) and the views that look different from `main`.

---

## Static Analysis (ui-sdk review tools)

`pull-request.yml` → `review` runs on every pull request, from `@cumulocity-iot/ui-sdk`:

| Step | Command | What it does |
|---|---|---|
| Risk and size | `c8y-ui review risk --base origin/main` | A level (high, medium, low) with the reasons (CI settings, `cumulocity.config.ts`, hooks, platform calls, writes, …) and the size without lockfile and world, on the run's summary page. Informational. |
| Generated selectors | `c8y-ui selectors --check` (in `test/`) | Fails when `test/playwright/selectors.ts` does not match the installed Web SDK (regenerate with `pnpm run e2e:selectors`). |
| Lint of the change | `c8y-ui review lint --base origin/main` | Fails on what `pnpm lint` fails on; lists the warnings on the lines the change adds and the suppressions it adds, as annotations in "Files changed". |
| Dependency exceptions | `c8y-ui audit --base origin/main --allow shared` | Release-age excludes in `pnpm-workspace.yaml` that are due and ignored advisories with an installable fix, for the packages the change touches. Fails on an exception to remove. |
| fallow | `c8y-ui fallow review --brief` (summary) then `c8y-ui fallow audit --base origin/main` (gate) | Dead code, complexity and duplication; the gate fails only on findings the change introduces, what `main` already has is reported. `c8y-ui` tells fallow what the platform loads (exported modules, `cumulocity.config.ts`, hook factories' `get()`, Karma specs) through plugins it writes into the git-ignored `.fallow/`. Repository exclusions live in `.fallowrc.json` (the Web SDK runtime packages the devkit bundles, ESLint plugins named as strings, `shared` imported through the path aliases, `tools/` run by hand). |

Locally: `pnpm exec c8y-ui fallow` for everything (164 inherited dead-code findings and 8 import cycles at the time of writing: not gated, worth a cleanup PR), `pnpm exec c8y-ui fallow audit --base origin/main` before opening a PR. One finding: `// fallow-ignore-next-line <rule> -- reason`.

ESLint carries the SDK's `c8y/no-unmanaged-subscribe` rule (`@cumulocity-iot/ui-sdk/eslint`, a warning: a `subscribe()` in a component without `takeUntilDestroyed` / `takeUntil` / `take` / `first`) and blocks the deprecated `HOOK_*` tokens of `@c8y/ngx-components` (`hookTab`, `hookRoute`, … instead).

---

## Code Conventions

- **Angular version:** `^21.x`. Do not use APIs from later Angular versions.
- **Standalone components only:** All components and pipes are `standalone: true`. There are **no NgModules** in plugin code.
- **Provider arrays replace NgModules:** Plugin entrypoints export named provider arrays (e.g. `EnergyConsumptionWidgetPluginProviders`). Deprecated `*Module` aliases may be kept for backward compatibility but must alias the provider array, not a real NgModule class.
- **`cumulocity.config.ts`:** `exports[].module` and `remotes` entries must reference the provider array name. `exports[].path` must point to the file that exports it.
- **Widget hooks:** Use `hookWidget` with `loadComponent` / `loadConfigComponent` (lazy). Never use the static `component` / `configComponent` fields on widget definitions.
- **Route hooks:** Use `hookRoute` with `loadComponent` (lazy). A plugin may export only a `hookRoute` provider array (no `hookWidget`) when it registers a standalone page rather than a dashboard widget.
- **Multiple plugins per package:** A single `cumulocity.config.ts` can declare multiple `exports` entries (each with its own `module` name) and list all of them in `remotes`. Each export maps to a separate named provider array in `src/app/index.ts`. Example: `packages/smart-views` exports both `SmartViewsPluginProviders` (device route) and `SmartViewsConfigurationPluginProviders` (navigator entry + configuration route).
- **Navigator + route pair:** When registering a navigator menu entry, always pair `hookNavigator(new NavigatorNode({ path, label, icon }))` with a matching `hookRoute({ path, loadComponent })` using the same `path` string. Both can live in the same provider array.
- **Drawer / action hooks:** `hookDrawer` and `hookAction` accept only a static `component` reference — SDK types have no lazy option. This is correct and expected.
- **`gettext` import:** Always import from `@c8y/ngx-components/gettext`, never from the main `@c8y/ngx-components` barrel.
- **Locale imports in `bootstrap.ts`:** The `./locales/de.po` import must appear after `@angular/compiler` and before other Angular imports.
- **Dependency injection:** Prefer `inject()` over constructor injection in new code.
- **Constructor side-effects:** Never perform async work or call services in a constructor. Use `ngOnInit()`.
- **Template control flow:** Always use Angular's built-in control flow syntax (`@if`, `@else if`, `@else`, `@for`, `@switch`). Never use the legacy structural directives `*ngIf`, `*ngFor`, `*ngSwitch`, or bare `<ng-container *ngIf=…>` wrappers. `CommonModule` must not be imported solely to enable those directives.
- **Style:** LESS (`.less`) for component styles.
- **Linting:** Flat ESLint config (`eslint.config.mjs`) covers TypeScript and Angular templates.
- **No cross-package relative imports** — always use the path aliases, never `../../shared/src/...`.
- **Cumulocity SDK version:** Pinned at `1024.21.x` for all `@c8y/*` packages. Do not bump packages independently; they must be updated together.
- **Barrel files:** Each feature area should have an `index.ts` that re-exports its public surface.
- **No `console.warn` / `console.log` in production code.**
- **Type-only imports and exports use `type`:** `import { type IManagedObject, InventoryService } from '@c8y/client'`, `import type { Foo } from './foo'`, `export type { Bar }`. Per-file compilers — a Vite + OXC dev server, esbuild — cannot see that a name is only a type: a re-exported interface or a missing export breaks the module at runtime (`does not provide an export named …`) while `ng build` still passes. Enforced by `verbatimModuleSyntax` in the root `tsconfig.json` and the ESLint rules `@typescript-eslint/consistent-type-imports` / `consistent-type-exports` (autofixable: `pnpm run lint:fix`).
  - **Exception — classes Angular injects through a constructor** must stay value imports (`NG2003: No suitable injection token` otherwise), and ESLint would mark them type-only. Use `inject(SomeService)` instead of constructor parameters (also when passing to `super(...)`): then the class is a value and both checks agree.
  - **No `const enum` values from libraries.** `@c8y/*` declares some enums as `declare const enum` (e.g. `ColumnDataType`) and does not export them at runtime — `ColumnDataType.TextShort` is `undefined` in the Vite dev server. Import the enum as a type and use the literal: `dataType: 'text-short' as ColumnDataType`.

---

## Script Generation

The `tools/generate-scripts.mts` file is an **ESM TypeScript** script (`.mts` extension — run with `node --experimental-strip-types`). It reads all projects from `angular.json` and regenerates the `build:*`, `serve:*`, `test:*`, and `test:watch:*` entries in `package.json`. The source of truth for which projects get test scripts is whether the project has a `@angular/build:karma` test target in `angular.json`.

The root `test` script (which chains all 14 suites sequentially) is also regenerated. Do **not** hand-edit anything after the `--generated----------` marker in `package.json`. CI verifies this: a change to root configuration re-runs `generate:scripts` and fails if `package.json` is stale.

---

## Build Artifacts

- Output: a ZIP archive per plugin in `dist/` (e.g. `dist/cumulocity-kpi-widget-plugin.zip`).
- Post-build, `tools/postbuild.js` renames the generated ZIP to include the version from the plugin's `package.json` (e.g. `dist/cumulocity-kpi-widget-plugin_1.0.4.zip`).
- The `clean` script removes the entire `dist/` directory before each build.

---

## Changelogs

Changelogs are **mandatory**: every change that a user, deployer or contributor would notice is documented in the same PR that makes it.

- **Per plugin:** `packages/<plugin>/CHANGELOG.md` (`# <Plugin name> Changelog`). Create it if the plugin has none yet.
  - One `## <version>` heading per release; the version matches the plugin's `package.json` `version`. Bumping the version and adding its changelog section go together.
  - Group entries under `### Features`, `### Bug Fixes`, `### Breaking Changes`, `### Dependencies` (only the groups that apply), one bullet per change, written for the reader of the release — what changed and why it matters, not which files moved.
  - **Keep entries brief**: one or two sentences per bullet, the user-visible effect first. Details belong in the PR, the code or the README, not in the changelog.
- **Repository-wide:** the root `CHANGELOG.md` (`## YYYY.MM.DD` headings) for changes that are not tied to one plugin: shared library, build tooling, CI workflows, test infrastructure, Web SDK / Angular upgrades.
- A change that touches several plugins (e.g. a Web SDK bump) gets a root entry **and** an entry in each affected plugin's changelog.
- Pure refactors without behavioral effect, test-only changes inside one plugin, and docs typo fixes need no entry.

---

## Dependency Audit

CI runs `pnpm audit --audit-level high` before every build and test job, ahead of `pnpm install`: the audit reads only the lockfile, so a vulnerable package is never downloaded or run. Any unignored high or critical advisory fails the PR.

- **A patched release exists** → force it with an entry in `pnpm.overrides` (`package.json`), scoped to the major (e.g. `"undici@7": "^7.30.1"`). Never ignore a fixable advisory.
- **No patched release** → add the GHSA id to `pnpm.auditConfig.ignoreGhsas` (`package.json`) **and** a row to the table below. pnpm 10.6 reads `auditConfig` only from `package.json`, which cannot hold comments, so this table is the justification.
- Re-check every row when the Web SDK, the ui-sdk or Playwright is bumped, and remove entries that have become fixable (`pnpm exec c8y-ui audit --allow shared` reports them; CI runs it for the packages a PR touches).

| GHSA | Package | Why it is accepted |
|---|---|---|
| GHSA-4w4v-5hc9-xrr2 | `angular@1.8.3` (AngularJS) | End of life, no fix (ReDoS). Shipped by `@c8y/ng1-modules`, the Web SDK's AngularJS layer; goes away only when Cumulocity drops AngularJS. |
| GHSA-7x27-g8rg-x87w | `angular@1.8.3` (AngularJS) | End of life, no fix (XSS). Same source as above. |
| GHSA-ch52-4w7c-c8xp | `http-cache-semantics@4.2.0` | No fix (cross-user cache disclosure). Via `make-fetch-happen` in the npm/Angular CLI tooling; build only, not bundled. |

**Licenses**: `.pnpmfile.cjs` (from the ui-sdk) runs before an install and stops `pnpm add` or an update when a new direct production dependency declares a license outside the allowed list (permissive ones and MPL-2.0; `test/c8y-ui.json` → `licenses.allow` / `licenses.accept` extend it); pnpm records the file's checksum in the lockfile, so a change to it needs `pnpm install` and the committed lockfile. The after-install check (`c8y-ui licenses`) cannot run in this repository: `pnpm licenses list` fails on `angular-file-upload`, a git tarball dependency of `@c8y/ng1-modules`, with `ERR_PNPM_MISSING_PACKAGE_INDEX_FILE` (a pnpm limitation, not a license problem). Re-try after a pnpm or Web SDK bump and add it to CI once it passes.

Overrides that are not security fixes (same reason: `package.json` cannot hold comments):

| Override | Why |
|---|---|
| `"@angular-devkit/build-angular@21": "21.2.27"` | 21.2.28 pulls webpack 5.112, which breaks `license-webpack-plugin` in every plugin build (`@c8y/devkit:build`). Drop it once a build-angular or webpack release fixes that; the Karma test builder (`@angular/build`) is unaffected and stays on the latest 21.2. |
| `"cypress": "-"` | `@cumulocity-iot/ui-sdk` declares Cypress as an optional peer and pnpm installs it anyway; the e2e suite is Playwright, and Cypress brings `extract-zip` advisories. `-` removes the dependency. |
| `"globals": "14.0.0"` | ESLint's `globals` pinned (moved here from `pnpm-workspace.yaml`: pnpm 10 ignores the workspace file's overrides when `package.json` has any). |

Security overrides pinned to an exact version instead of `^`, so a freshly published release is not pulled in before it had time to be vetted (supply-chain risk), are temporary: once their noted date has passed, switch them back to the `^` range and run `pnpm install`. None at the moment (the Cypress-only pins went with Cypress).

Peer ranges relaxed in `pnpm.peerDependencyRules.allowedVersions` (`strict-peer-dependencies=true` fails any non-frozen install otherwise):

| Rule | Why |
|---|---|
| `"@module-federation/vite>vite": "8"` | The Vite dev server (`pnpm run dev`) runs on Vite 8; `@module-federation/vite` declares a narrower range. |

---

## MCP Servers

### `c8y-web-sdk-knowledge` — use FIRST for all Cumulocity development

A local knowledge-graph MCP server over the Cumulocity Web SDK source. **For any development task that touches Cumulocity APIs — `@c8y/client`, `@c8y/ngx-components`, hooks, widgets, services, models — query this server FIRST, before web search, before grepping `node_modules`, and before writing code from memory.** SDK bundles in `node_modules` are minified; grepping them wastes time and produces wrong answers, while this server resolves the real, version-accurate API surface.

Available tools:

| Tool | Use for |
|---|---|
| `resolve_symbol` | Resolve an exact SDK symbol (class, service, interface, hook) to its definition |
| `get_node` | Fetch full details of a known node (members, signatures, docs) |
| `find_usage` | Find where a symbol is used across the SDK — real-world usage patterns |
| `search_concept` | Semantic search when you only know the concept, not the symbol name |

Recommended flow: `search_concept` (when unsure of the name) → `resolve_symbol` → `get_node` for details → `find_usage` for patterns. Only fall back to other sources (c8y-docs, web search) if the knowledge server has no answer.

The server is distributed as a **GitHub package** (`@cumulocity-iot/c8y-web-sdk-knowledge-mcp`) — no checkout or build needed. One-time setup: add these two lines to your `~/.npmrc` (create the file if it doesn't exist), using a token with `read:packages` access:

```ini
@cumulocity-iot:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<your token>
```

After that it works like a regular npm package. Register it at the **user level** in Claude Code:

```bash
claude mcp add c8y-web-sdk-knowledge -- npx -y @cumulocity-iot/c8y-web-sdk-knowledge-mcp
```

Equivalent `~/.claude.json` → `mcpServers` entry:

```jsonc
{
  "mcpServers": {
    "c8y-web-sdk-knowledge": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@cumulocity-iot/c8y-web-sdk-knowledge-mcp"]
    }
  }
}
```

If its tools (`mcp__c8y-web-sdk-knowledge__*`) are not available in your session, tell the user instead of silently falling back.

### `c8y-docs` — official documentation (secondary)

Hosted MCP server for the official Cumulocity IoT API and SDK docs. Use it as a complement to `c8y-web-sdk-knowledge` for REST API endpoint documentation and conceptual guides. Configure in your editor's MCP settings (e.g. `.vscode/mcp.json`) if not already present:

```jsonc
{
  "servers": {
    "c8y-docs": {
      "type": "http",
      "url": "https://c8y-codex-mcp.schplitt.workers.dev/mcp"
    }
  }
}
```

---

## External Reference Docs

Agents should consult these authoritative references when writing or reviewing code:

- **Angular 21 full API & guide context:** [https://angular.dev/assets/context/llms-full.txt](https://angular.dev/assets/context/llms-full.txt) — use this when working with Angular APIs, decorators, lifecycle hooks, signals, or framework patterns.
- **Mastering TypeScript skill:** [https://github.com/SpillwaveSolutions/mastering-typescript-skill/tree/main/mastering-typescript](https://github.com/SpillwaveSolutions/mastering-typescript-skill/tree/main/mastering-typescript) — follow the patterns and conventions described here for all TypeScript code in this repository.

---

## What to Avoid

- Do **not** add Jest, `jest-preset-angular`, or any `jest.*` / `setup-jest.*` files. The unit test stack is Karma + Jasmine exclusively; e2e is Playwright on the tenant mock (no Cypress, no real tenant).
- Do **not** silence fallow or the `c8y/*` ESLint rules for a whole folder to get a PR green: fix the finding, or mark the one line with its reason (`// fallow-ignore-next-line <rule> -- reason`, `// eslint-disable-next-line … -- reason`).
- Do **not** manually add `serve:*`, `build:*`, `test:*`, or `test:watch:*` scripts to the root `package.json` — use `generate:scripts`.
- Do **not** edit `dist/` — it is ephemeral build output.
- Do **not** open a PR with user-facing changes but no changelog entry — see [Changelogs](#changelogs).
- Do **not** install packages directly into a plugin's `node_modules`; all dependencies are hoisted to the root via pnpm (`.npmrc`: `shamefully-hoist=true`).
- Do **not** use `CommonJS require()` in Angular source files — this is an ESM workspace.
- Do **not** create NgModules (`@NgModule`). Use standalone components and provider arrays.
- Do **not** use static `component` / `configComponent` on `hookWidget` definitions — use `loadComponent` / `loadConfigComponent`.
- Do **not** import `gettext` from `@c8y/ngx-components` — use `@c8y/ngx-components/gettext`.
- Do **not** commit environment variables. Use a local `.env` file or shell environment for `C8Y_BASEURL`, `C8Y_SHELL_TARGET`, `C8Y_USERNAME`, `C8Y_PASSWORD`.
